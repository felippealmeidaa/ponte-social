"""Configurações › Fluxos: fluxos de etapas montados pela coordenação, rodados só no simulador do painel.
Um fluxo pode ser salvo incompleto (rascunho): a resposta traz os problemas, e o simulador só roda fluxo sem problema."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import apenas_coordenacao, usuario_logado
from app.db import get_session
from app.models import AgentePersonalizado, FluxoPersonalizado, iso
from app.services.agentes.ferramentas import catalogo_para_painel
from app.services.fluxos import motor

router = APIRouter(dependencies=[Depends(usuario_logado)])


async def _agentes(session: AsyncSession) -> List[AgentePersonalizado]:
    return list((await session.execute(select(AgentePersonalizado).order_by(AgentePersonalizado.nome))).scalars())


async def _dict(session: AsyncSession, f: FluxoPersonalizado) -> Dict[str, Any]:
    ids = {a.id for a in await _agentes(session)}
    return {"id": f.id, "nome": f.nome, "descricao": f.descricao, "etapas": f.etapas or [], "ligacoes": f.ligacoes or [],
            "problemas": motor.validar(f.etapas or [], f.ligacoes or [], ids),
            "criado_em": iso(f.criado_em), "criado_por": f.criado_por, "atualizado_em": iso(f.atualizado_em), "atualizado_por": f.atualizado_por}


class DadosFluxo(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str = Field(default="", max_length=300)
    etapas: List[Dict[str, Any]] = Field(default_factory=list, max_length=motor.MAX_ETAPAS + 10)
    ligacoes: List[Dict[str, Any]] = Field(default_factory=list, max_length=motor.MAX_ETAPAS * (motor.MAX_OPCOES + 1))


async def _fluxo(session: AsyncSession, fluxo_id: str) -> FluxoPersonalizado:
    f = await session.get(FluxoPersonalizado, fluxo_id)
    if not f:
        raise HTTPException(status_code=404, detail="Fluxo não encontrado.")
    return f


@router.get("")
async def listar(session: AsyncSession = Depends(get_session)):
    fluxos = list((await session.execute(select(FluxoPersonalizado).order_by(FluxoPersonalizado.criado_em))).scalars())
    return {
        "limites": {"etapas": motor.MAX_ETAPAS, "passos_por_mensagem": motor.MAX_PASSOS, "opcoes": motor.MAX_OPCOES},
        "ferramentas": catalogo_para_painel(),
        "agentes": [{"id": a.id, "nome": a.nome} for a in await _agentes(session)],
        "fluxos": [await _dict(session, f) for f in fluxos],
    }


@router.post("", status_code=201)
async def criar(payload: DadosFluxo, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    f = FluxoPersonalizado(id=uuid.uuid4().hex[:16], nome=payload.nome.strip(), descricao=payload.descricao.strip(),
                           etapas=payload.etapas, ligacoes=payload.ligacoes, criado_por=usuario.get("nome") or usuario.get("sub"))
    session.add(f)
    await session.commit()
    return await _dict(session, f)


@router.put("/{fluxo_id}")
async def editar(fluxo_id: str, payload: DadosFluxo, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                 session: AsyncSession = Depends(get_session)):
    f = await _fluxo(session, fluxo_id)
    f.nome, f.descricao, f.etapas, f.ligacoes = payload.nome.strip(), payload.descricao.strip(), payload.etapas, payload.ligacoes
    f.atualizado_em, f.atualizado_por = datetime.now(timezone.utc), usuario.get("nome") or usuario.get("sub")
    await session.commit()
    return await _dict(session, f)


@router.delete("/{fluxo_id}")
async def apagar(fluxo_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    await session.delete(await _fluxo(session, fluxo_id))
    await session.commit()
    return {"removido": fluxo_id}


class Rodada(BaseModel):
    estado: Optional[Dict[str, Any]] = None
    mensagem: Optional[str] = Field(default=None, max_length=2000)


@router.post("/{fluxo_id}/simular")
async def simular(fluxo_id: str, payload: Rodada, session: AsyncSession = Depends(get_session)):
    """Uma rodada no simulador: sem estado começa do início; com mensagem responde à pergunta que está esperando.
    Nada é gravado e nada vai para o WhatsApp."""
    f = await _fluxo(session, fluxo_id)
    problemas = motor.validar(f.etapas or [], f.ligacoes or [], {a.id for a in await _agentes(session)})
    if problemas:
        raise HTTPException(status_code=422, detail="Corrija o fluxo antes de testar: " + " ".join(problemas[:3]))
    return await motor.executar(session, f.etapas, f.ligacoes, payload.estado, payload.mensagem)
