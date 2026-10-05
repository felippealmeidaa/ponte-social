"""Dependências de autenticação das rotas do painel."""
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db import get_session
from app.models import UnidadeAtendimento, Usuario

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
    return {**payload, "role": usuario.papel, "nome": usuario.nome, "unidade_id": usuario.unidade_id}


async def apenas_coordenacao(usuario: Dict[str, Any] = Depends(usuario_logado)) -> Dict[str, Any]:
    if usuario.get("role") != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só a coordenação pode fazer isso.")
    return usuario


async def apenas_coordenacao_geral(usuario: Dict[str, Any] = Depends(apenas_coordenacao)) -> Dict[str, Any]:
    """Coordenação sem unidade (secretaria): cadastra CRAS e mexe no padrão de todos."""
    if usuario.get("unidade_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só a coordenação geral pode fazer isso.")
    return usuario


def escopo(usuario: Dict[str, Any]) -> Optional[str]:
    """CRAS que a conta enxerga. None = todas as unidades (coordenação geral)."""
    return usuario.get("unidade_id")


async def resolver_unidade(usuario: Dict[str, Any], pedida: Optional[str], session: AsyncSession) -> Optional[str]:
    """Qual configuração a conta está vendo/editando: a da própria unidade, ou (coordenação geral) a pedida.
    None = padrão da secretaria."""
    propria = escopo(usuario)
    if propria:
        if pedida and pedida != propria:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Você só pode ver e editar a sua unidade.")
        return propria
    if pedida and not await session.get(UnidadeAtendimento, pedida):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidade não encontrada.")
    return pedida or None


def pode_ver(usuario: Dict[str, Any], unidade_do_item: Optional[str]) -> bool:
    propria = escopo(usuario)
    return propria is None or propria == unidade_do_item
