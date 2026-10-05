"""Tela "Serviços e mensagens": o CRAS edita o que o bot responde, sem mexer em código."""
from datetime import date
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import usuario_logado
from app.db import get_session
from app.services import catalogo, unidades
from app.services.bot.fluxo_conversa import caminho_completo
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES

router = APIRouter(dependencies=[Depends(usuario_logado)])


class ServicoRequest(BaseModel):
    titulo: str = Field(min_length=3, max_length=160)
    servicos: List[str] = Field(min_length=1)
    documentos: List[str] = Field(min_length=1)
    local_atendimento: str = Field(min_length=3)
    contato_util: str = Field(min_length=3)
    fonte: str = Field(default="", max_length=500, description="Link ou documento oficial de onde veio a regra")
    verificado_em: Optional[date] = Field(default=None, description="Data em que alguém do CRAS conferiu a informação")


class TextoRequest(BaseModel):
    texto: str


def _categoria_valida(categoria: str) -> None:
    if categoria not in KNOWLEDGE_SERVICES:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")


@router.get("/servicos")
async def listar_servicos(session: AsyncSession = Depends(get_session)):
    return await catalogo.listar_servicos(session)


@router.put("/servicos/{categoria}")
async def salvar_servico(categoria: str, req: ServicoRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                         session: AsyncSession = Depends(get_session)):
    _categoria_valida(categoria)
    dados = req.model_dump()
    if not [s for s in dados["servicos"] if s.strip()] or not [d for d in dados["documentos"] if d.strip()]:
        raise HTTPException(status_code=422, detail="Informe pelo menos um serviço e um documento.")
    if dados["verificado_em"] and dados["verificado_em"] > date.today():
        raise HTTPException(status_code=422, detail="A data de conferência não pode estar no futuro.")
    return await catalogo.salvar_servico(session, categoria, dados, usuario.get("sub", ""))


@router.post("/servicos/{categoria}/restaurar")
async def restaurar_servico(categoria: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                            session: AsyncSession = Depends(get_session)):
    _categoria_valida(categoria)
    return await catalogo.restaurar_servico(session, categoria, usuario.get("sub", ""))


@router.get("/servicos/{categoria}/previa")
async def previa_resposta(categoria: str):
    """Como a resposta do bot aparece no WhatsApp para essa categoria."""
    _categoria_valida(categoria)
    return {"texto": caminho_completo(categoria)}


@router.get("/textos")
async def listar_textos(session: AsyncSession = Depends(get_session)):
    return await catalogo.listar_textos(session)


@router.put("/textos/{chave}")
async def salvar_texto(chave: str, req: TextoRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                       session: AsyncSession = Depends(get_session)):
    erro = catalogo.validar_texto(chave, req.texto)
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    return {"chave": chave, "texto": await catalogo.salvar_texto(session, chave, req.texto, usuario.get("sub", ""))}


# ------------------------------------------------------------------------------
# Unidades de atendimento (CRAS, CREAS, Centro POP) e os bairros que cada uma atende
# ------------------------------------------------------------------------------
class UnidadeRequest(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    tipo: Literal["CRAS", "CREAS", "CENTRO_POP"] = "CRAS"
    endereco: str = Field(default="", max_length=300)
    telefone: str = Field(default="", max_length=80)
    horario: str = Field(default="", max_length=160)
    bairros: List[str] = Field(default_factory=list)
    fonte: str = Field(default="", max_length=500)
    verificado_em: Optional[date] = None
    ativo: bool = True


@router.get("/unidades")
async def listar_unidades(session: AsyncSession = Depends(get_session)):
    return [unidades.para_dict(u) for u in await unidades.listar(session)]


async def _salvar_unidade(req: UnidadeRequest, usuario: Dict[str, Any], session: AsyncSession, unidade_id: Optional[str] = None):
    if not unidades.data_valida(req.verificado_em):
        raise HTTPException(status_code=422, detail="A data de conferência não pode estar no futuro.")
    if req.tipo == "CRAS" and not [b for b in req.bairros if b.strip()]:
        raise HTTPException(status_code=422, detail="Informe pelo menos um bairro atendido por este CRAS.")
    try:
        return unidades.para_dict(await unidades.salvar(session, req.model_dump(), usuario.get("sub", ""), unidade_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/unidades")
async def criar_unidade(req: UnidadeRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                        session: AsyncSession = Depends(get_session)):
    return await _salvar_unidade(req, usuario, session)


@router.put("/unidades/{unidade_id}")
async def atualizar_unidade(unidade_id: str, req: UnidadeRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                            session: AsyncSession = Depends(get_session)):
    return await _salvar_unidade(req, usuario, session, unidade_id)


@router.delete("/unidades/{unidade_id}")
async def remover_unidade(unidade_id: str, session: AsyncSession = Depends(get_session)):
    try:
        await unidades.remover(session, unidade_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"removida": unidade_id}


@router.get("/unidades/buscar")
async def buscar_por_bairro(bairro: str, session: AsyncSession = Depends(get_session)):
    """Testa qual CRAS o bot indicaria para um bairro."""
    unidade = await unidades.cras_do_bairro(session, bairro)
    return {"bairro": bairro, "unidade": unidades.para_dict(unidade) if unidade else None}
