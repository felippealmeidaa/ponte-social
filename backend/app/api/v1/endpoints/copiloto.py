"""Copiloto construtor: propõe fluxos e agentes a partir de um pedido em texto. Só a coordenação; nada é salvo aqui."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import apenas_coordenacao
from app.db import get_session
from app.models import AgentePersonalizado, FluxoPersonalizado
from app.services import copiloto

router = APIRouter(dependencies=[Depends(apenas_coordenacao)])


class PedidoFluxo(BaseModel):
    pedido: str = Field(min_length=10, max_length=1500)
    fluxo_id: Optional[str] = None  # com fluxo: ajusta o atual em vez de criar do zero


class PedidoAgente(BaseModel):
    pedido: str = Field(min_length=10, max_length=1500)


@router.post("/fluxo")
async def propor_fluxo(payload: PedidoFluxo, session: AsyncSession = Depends(get_session)) -> Dict[str, Any]:
    agentes = [{"id": a.id, "nome": a.nome} for a in (await session.execute(select(AgentePersonalizado))).scalars()]
    atual = None
    if payload.fluxo_id:
        f = await session.get(FluxoPersonalizado, payload.fluxo_id)
        if not f:
            raise HTTPException(status_code=404, detail="Fluxo não encontrado.")
        atual = {"nome": f.nome, "descricao": f.descricao, "etapas": f.etapas or [], "ligacoes": f.ligacoes or []}
    try:
        return await copiloto.propor_fluxo(payload.pedido, agentes, atual)
    except copiloto.CopilotoIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro))


@router.post("/agente")
async def propor_agente(payload: PedidoAgente) -> Dict[str, Any]:
    try:
        return await copiloto.propor_agente(payload.pedido)
    except copiloto.CopilotoIndisponivel as erro:
        raise HTTPException(status_code=503, detail=str(erro))
