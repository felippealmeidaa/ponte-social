"""Tela "Serviços e mensagens": o CRAS edita o que o bot responde, sem mexer em código."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import usuario_logado
from app.db import get_session
from app.services import catalogo
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
