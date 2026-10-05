"""Dependências de autenticação das rotas do painel."""
from typing import Any, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db import get_session
from app.models import Usuario

_bearer = HTTPBearer(auto_error=False)


async def usuario_logado(credenciais: HTTPAuthorizationCredentials = Depends(_bearer),
                         session: AsyncSession = Depends(get_session)) -> Dict[str, Any]:
    """Exige um token de acesso válido (gerado em /auth/login) de uma conta ainda ativa.
    O papel vem do banco, então mudanças feitas pela coordenação valem na hora.
    Webhooks do WhatsApp não usam isto."""
    payload = decode_token(credenciais.credentials) if credenciais else None
    if not payload or payload.get("type") == "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada ou inválida. Entre novamente.")
    usuario = await session.get(Usuario, payload.get("sub"))
    if not usuario or not usuario.ativo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Conta desativada ou inexistente.")
    return {**payload, "role": usuario.papel, "nome": usuario.nome}


async def apenas_coordenacao(usuario: Dict[str, Any] = Depends(usuario_logado)) -> Dict[str, Any]:
    if usuario.get("role") != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só a coordenação pode fazer isso.")
    return usuario
