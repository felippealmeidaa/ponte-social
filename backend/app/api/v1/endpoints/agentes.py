"""Configurações › Agentes: agentes de IA com ferramentas de consulta, testados só no painel.
Ver e testar: qualquer pessoa da equipe. Criar, editar e apagar: só a coordenação."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import apenas_coordenacao, usuario_logado
from app.db import get_session
from app.models import AgentePersonalizado, iso
from app.services.agentes import executor
from app.services.agentes.ferramentas import catalogo_para_painel

router = APIRouter(dependencies=[Depends(usuario_logado)])


def _autor(usuario: Dict[str, Any]) -> str:
    return usuario.get("nome") or usuario.get("sub", "")


def _dict(a: AgentePersonalizado) -> Dict[str, Any]:
    return {"id": a.id, "nome": a.nome, "descricao": a.descricao, "instrucoes": a.instrucoes, "temperatura": a.temperatura,
            "ferramentas": a.ferramentas or [], "ativo": a.ativo, "criado_em": iso(a.criado_em), "criado_por": a.criado_por,
            "atualizado_em": iso(a.atualizado_em), "atualizado_por": a.atualizado_por}


class DadosAgente(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str = Field(default="", max_length=300)
    instrucoes: str = Field(min_length=1, max_length=6000)
    temperatura: float = 0.2
    ferramentas: List[str] = []
    ativo: bool = True


async def _agente(session: AsyncSession, agente_id: str) -> AgentePersonalizado:
    a = await session.get(AgentePersonalizado, agente_id)
    if not a:
        raise HTTPException(status_code=404, detail="Agente não encontrado.")
    return a


@router.get("")
async def listar(session: AsyncSession = Depends(get_session)):
    agentes = (await session.execute(select(AgentePersonalizado).order_by(AgentePersonalizado.criado_em))).scalars()
    return {"ia_disponivel": bool(settings.GEMINI_API_KEY), "modelo": settings.GEMINI_MODEL, "max_passos": executor.MAX_PASSOS,
            "regras_fixas": executor.REGRAS_FIXAS.split("\n\nInstruções")[0], "ferramentas": catalogo_para_painel(),
            "agentes": [_dict(a) for a in agentes]}


@router.post("", status_code=201)
async def criar(payload: DadosAgente, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    erro = executor.validar(payload.nome, payload.instrucoes, payload.temperatura, payload.ferramentas)
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    a = AgentePersonalizado(id=uuid.uuid4().hex[:16], nome=payload.nome.strip(), descricao=payload.descricao.strip(),
                            instrucoes=payload.instrucoes.strip(), temperatura=payload.temperatura,
                            ferramentas=list(dict.fromkeys(payload.ferramentas)), ativo=payload.ativo, criado_por=_autor(usuario))
    session.add(a)
    await session.commit()
    return _dict(a)


@router.put("/{agente_id}")
async def editar(agente_id: str, payload: DadosAgente, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                 session: AsyncSession = Depends(get_session)):
    a = await _agente(session, agente_id)
    erro = executor.validar(payload.nome, payload.instrucoes, payload.temperatura, payload.ferramentas)
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    a.nome, a.descricao, a.instrucoes = payload.nome.strip(), payload.descricao.strip(), payload.instrucoes.strip()
    a.temperatura, a.ferramentas, a.ativo = payload.temperatura, list(dict.fromkeys(payload.ferramentas)), payload.ativo
    a.atualizado_em, a.atualizado_por = datetime.now(timezone.utc), _autor(usuario)
    await session.commit()
    return _dict(a)


@router.delete("/{agente_id}")
async def apagar(agente_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    await session.delete(await _agente(session, agente_id))
    await session.commit()
    return {"removido": agente_id}


class Mensagem(BaseModel):
    autor: Literal["pessoa", "agente"]
    texto: str = Field(max_length=4000)


class Teste(BaseModel):
    mensagem: str = Field(min_length=1, max_length=2000)
    historico: List[Mensagem] = []


@router.post("/{agente_id}/testar")
async def testar(agente_id: str, payload: Teste, session: AsyncSession = Depends(get_session)):
    """Conversa de teste: nada é gravado e nada vai para o WhatsApp."""
    a = await _agente(session, agente_id)
    try:
        return await executor.responder(session, a, [m.model_dump() for m in payload.historico], payload.mensagem)
    except executor.AgenteIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro))
