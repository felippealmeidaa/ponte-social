"""Modo demonstração: gerar e apagar casos fictícios (canal "demo"). Ligar/desligar é a opção "modo_demonstracao"."""
from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import apenas_coordenacao_geral, usuario_logado
from app.db import get_session
from app.services import demonstracao

router = APIRouter()


class GerarRequest(BaseModel):
    quantos: int = Field(default=60, ge=1, le=demonstracao.MAX_EXEMPLOS)
    dias: int = Field(default=30, ge=1, le=90)


@router.get("")
async def situacao(_: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    return {"ligado": demonstracao.ligado(), "exemplos": await demonstracao.contar(session), "maximo": demonstracao.MAX_EXEMPLOS}


@router.post("/gerar")
async def gerar(req: GerarRequest, _: Dict[str, Any] = Depends(apenas_coordenacao_geral),
                session: AsyncSession = Depends(get_session)):
    criados = await demonstracao.gerar(session, req.quantos, req.dias)
    return {"criados": criados, "exemplos": await demonstracao.contar(session)}


@router.delete("")
async def apagar(_: Dict[str, Any] = Depends(apenas_coordenacao_geral), session: AsyncSession = Depends(get_session)):
    apagados = await demonstracao.apagar(session)
    return {"apagados": apagados, "exemplos": 0}
