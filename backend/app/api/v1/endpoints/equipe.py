"""Gestão da equipe do painel (só coordenação)."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import apenas_coordenacao
from app.db import get_session
from app.services import usuarios

router = APIRouter(dependencies=[Depends(apenas_coordenacao)])


class NovaContaRequest(BaseModel):
    login: str = Field(min_length=2, max_length=60)
    nome: str = Field(min_length=2, max_length=120)
    email: str = Field(default="", max_length=160)
    senha: str = Field(min_length=1, max_length=200)
    papel: Literal["ADMIN", "ATENDENTE"] = "ATENDENTE"


class AtualizarContaRequest(BaseModel):
    nome: Optional[str] = Field(default=None, max_length=120)
    papel: Optional[Literal["ADMIN", "ATENDENTE"]] = None
    ativo: Optional[bool] = None


class RedefinirSenhaRequest(BaseModel):
    nova_senha: str = Field(min_length=1, max_length=200)


def _erro(e: usuarios.ErroUsuario) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


@router.get("")
async def listar(session: AsyncSession = Depends(get_session)):
    return [usuarios.para_dict(u) for u in await usuarios.listar(session)]


@router.post("")
async def criar(req: NovaContaRequest, session: AsyncSession = Depends(get_session)):
    try:
        return usuarios.para_dict(await usuarios.criar(session, req.login, req.nome, req.senha, req.papel, req.email))
    except usuarios.ErroUsuario as e:
        raise _erro(e)


@router.patch("/{usuario_id}")
async def atualizar(usuario_id: str, req: AtualizarContaRequest, session: AsyncSession = Depends(get_session)):
    try:
        return usuarios.para_dict(await usuarios.atualizar(session, usuario_id, nome=req.nome, papel=req.papel, ativo=req.ativo))
    except usuarios.ErroUsuario as e:
        raise _erro(e)


@router.post("/{usuario_id}/senha")
async def redefinir_senha(usuario_id: str, req: RedefinirSenhaRequest, session: AsyncSession = Depends(get_session)):
    try:
        await usuarios.definir_senha(session, usuario_id, req.nova_senha)
    except usuarios.ErroUsuario as e:
        raise _erro(e)
    return {"message": "Senha redefinida. Passe a nova senha à pessoa por um canal seguro."}
