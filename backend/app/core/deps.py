"""Dependências de autenticação das rotas do painel."""
from typing import Any, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token

_bearer = HTTPBearer(auto_error=False)


def usuario_logado(credenciais: HTTPAuthorizationCredentials = Depends(_bearer)) -> Dict[str, Any]:
    """Exige um token de acesso válido (gerado em /auth/login). Webhooks do WhatsApp não usam isto."""
    payload = decode_token(credenciais.credentials) if credenciais else None
    if not payload or payload.get("type") == "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada ou inválida. Entre novamente.")
    return payload
