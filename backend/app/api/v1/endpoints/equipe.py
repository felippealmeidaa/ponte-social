"""Gestão da equipe do painel (só coordenação).

Coordenação geral gerencia todas as contas; coordenação de um CRAS só as contas da própria unidade,
sem poder criar contas de outra unidade nem da coordenação geral."""
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import apenas_coordenacao, escopo
from app.db import get_session
from app.models import Usuario
from app.services import usuarios

router = APIRouter(dependencies=[Depends(apenas_coordenacao)])


class NovaContaRequest(BaseModel):
    login: str = Field(min_length=2, max_length=60)
    nome: str = Field(min_length=2, max_length=120)
    email: str = Field(default="", max_length=160)
    senha: str = Field(min_length=1, max_length=200)
    papel: Literal["ADMIN", "ATENDENTE"] = "ATENDENTE"
    unidade_id: Optional[str] = None  # None = coordenação geral (só a coordenação geral pode criar)


class AtualizarContaRequest(BaseModel):
    nome: Optional[str] = Field(default=None, max_length=120)
    papel: Optional[Literal["ADMIN", "ATENDENTE"]] = None
    ativo: Optional[bool] = None
    unidade_id: Optional[str] = None
    mudar_unidade: bool = False  # True para aplicar unidade_id (inclusive None = coordenação geral)


class RedefinirSenhaRequest(BaseModel):
    nova_senha: str = Field(min_length=1, max_length=200)


def _erro(e: usuarios.ErroUsuario) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


async def _conta_visivel(session: AsyncSession, usuario_id: str, quem: Dict[str, Any]) -> Usuario:
    conta = await session.get(Usuario, usuario_id)
    if conta is None or (escopo(quem) and conta.unidade_id != escopo(quem)):
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    return conta


@router.get("")
async def listar(quem: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    return [usuarios.para_dict(u) for u in await usuarios.listar(session, escopo(quem))]


@router.post("")
async def criar(req: NovaContaRequest, quem: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    unidade_id = escopo(quem) or req.unidade_id  # coordenação de CRAS cria sempre na própria unidade
    try:
        return usuarios.para_dict(await usuarios.criar(session, req.login, req.nome, req.senha, req.papel, req.email, unidade_id))
    except usuarios.ErroUsuario as e:
        raise _erro(e)


@router.patch("/{usuario_id}")
async def atualizar(usuario_id: str, req: AtualizarContaRequest, quem: Dict[str, Any] = Depends(apenas_coordenacao),
                    session: AsyncSession = Depends(get_session)):
    await _conta_visivel(session, usuario_id, quem)
    if req.mudar_unidade and escopo(quem):
        raise HTTPException(status_code=403, detail="Só a coordenação geral muda a unidade de uma conta.")
    extra = {"unidade_id": req.unidade_id} if req.mudar_unidade else {}
    try:
        return usuarios.para_dict(await usuarios.atualizar(session, usuario_id, nome=req.nome, papel=req.papel, ativo=req.ativo, **extra))
    except usuarios.ErroUsuario as e:
        raise _erro(e)


@router.post("/{usuario_id}/senha")
async def redefinir_senha(usuario_id: str, req: RedefinirSenhaRequest, quem: Dict[str, Any] = Depends(apenas_coordenacao),
                          session: AsyncSession = Depends(get_session)):
    await _conta_visivel(session, usuario_id, quem)
    try:
        await usuarios.definir_senha(session, usuario_id, req.nova_senha)
    except usuarios.ErroUsuario as e:
        raise _erro(e)
    return {"message": "Senha redefinida. Passe a nova senha à pessoa por um canal seguro."}
