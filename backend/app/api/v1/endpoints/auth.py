from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import usuario_logado
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.db import get_session
from app.models import Usuario
from app.services import usuarios

router = APIRouter()

TENANT_PADRAO = "cras-anapolis-01"


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class TrocarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str = Field(min_length=1, max_length=200)


def _token(usuario: Usuario) -> str:
    return create_access_token(subject=usuario.id, tenant_id=TENANT_PADRAO, role=usuario.papel)


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, response: Response, session: AsyncSession = Depends(get_session)):
    usuario = await usuarios.autenticar(session, credentials.username_or_email, credentials.password)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos.")

    response.set_cookie(
        key="refresh_token",
        value=create_refresh_token(subject=usuario.id),
        httponly=True,
        secure=False,
        samesite="lax",
        path="/api/v1/auth/refresh",
        max_age=7 * 24 * 60 * 60
    )
    return {"access_token": _token(usuario), "token_type": "bearer", "user": usuarios.para_dict(usuario)}


@router.post("/refresh")
async def refresh_token(request: Request, session: AsyncSession = Depends(get_session)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token ausente")
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido ou expirado")
    usuario = await session.get(Usuario, payload.get("sub"))
    if not usuario or not usuario.ativo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Conta desativada ou inexistente.")
    return {"access_token": _token(usuario), "token_type": "bearer"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/v1/auth/refresh")
    return {"message": "Logout realizado com sucesso"}


@router.get("/eu")
async def quem_sou_eu(usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    u = await session.get(Usuario, usuario["sub"])
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return usuarios.para_dict(u)


@router.post("/trocar-senha")
async def trocar_senha(req: TrocarSenhaRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                       session: AsyncSession = Depends(get_session)):
    try:
        await usuarios.definir_senha(session, usuario["sub"], req.nova_senha, atual=req.senha_atual)
    except usuarios.ErroUsuario as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"message": "Senha alterada."}
