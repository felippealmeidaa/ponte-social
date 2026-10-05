"""
Contas de acesso ao painel.

- Coordenação (ADMIN) gerencia a equipe; atendimento (ATENDENTE) opera fila, conversas e serviços.
- Primeira conta: se o banco não tiver usuários, cria a coordenação de ADMIN_LOGIN/ADMIN_SENHA_INICIAL.
  Sem essas variáveis, só em development, cria a conta de demonstração teste/123 (nunca em produção).
- O sistema nunca fica sem uma coordenação ativa.
"""
import uuid
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import Usuario, agora

PAPEIS = ("ADMIN", "ATENDENTE")
SENHA_MINIMA = 8


class ErroUsuario(ValueError):
    """Regra de negócio violada (mensagem pronta para mostrar no painel)."""


def para_dict(u: Usuario) -> dict:
    return {
        "id": u.id, "login": u.login, "name": u.nome, "email": u.email, "role": u.papel, "ativo": u.ativo,
        "criado_em": u.criado_em.isoformat() if u.criado_em else None,
        "ultimo_acesso": u.ultimo_acesso.isoformat() if u.ultimo_acesso else None,
    }


def validar_senha(senha: str) -> None:
    if len(senha) < SENHA_MINIMA:
        raise ErroUsuario(f"A senha precisa ter pelo menos {SENHA_MINIMA} caracteres.")


async def _novo(session: AsyncSession, login: str, nome: str, senha: str, papel: str, email: str = "") -> Usuario:
    usuario = Usuario(id=f"usr-{uuid.uuid4().hex[:8]}", login=login.strip().lower(), nome=nome.strip(),
                      email=email.strip().lower(), senha_hash=hash_password(senha), papel=papel)
    session.add(usuario)
    await session.commit()
    return usuario


async def garantir_usuario_inicial(session: AsyncSession) -> Optional[str]:
    """Cria a primeira conta se não houver nenhuma. Devolve uma mensagem para o log, ou None."""
    if (await session.execute(select(func.count()).select_from(Usuario))).scalar_one():
        return None
    if settings.ADMIN_LOGIN and settings.ADMIN_SENHA_INICIAL:
        validar_senha(settings.ADMIN_SENHA_INICIAL)
        await _novo(session, settings.ADMIN_LOGIN, settings.ADMIN_NOME, settings.ADMIN_SENHA_INICIAL, "ADMIN")
        return f"Conta de coordenação '{settings.ADMIN_LOGIN}' criada. Troque a senha no primeiro acesso."
    if settings.ENVIRONMENT == "development":
        await _novo(session, "teste", "Administrador de Teste", "123", "ADMIN", "teste@cras.gov.br")
        return "Conta de DEMONSTRAÇÃO teste/123 criada (só em development). Não use em produção."
    return "Nenhum usuário cadastrado: defina ADMIN_LOGIN e ADMIN_SENHA_INICIAL para criar a coordenação."


async def autenticar(session: AsyncSession, login_ou_email: str, senha: str) -> Optional[Usuario]:
    await garantir_usuario_inicial(session)  # banco recém-criado: a primeira conta nasce no primeiro login
    chave = login_ou_email.strip().lower()
    usuario = (await session.execute(
        select(Usuario).where((Usuario.login == chave) | ((Usuario.email == chave) & (Usuario.email != "")))
    )).scalars().first()
    if not usuario or not usuario.ativo or not verify_password(senha, usuario.senha_hash):
        return None
    usuario.ultimo_acesso = agora()
    await session.commit()
    return usuario


async def listar(session: AsyncSession) -> List[Usuario]:
    return list((await session.execute(select(Usuario).order_by(Usuario.ativo.desc(), Usuario.nome))).scalars())


async def criar(session: AsyncSession, login: str, nome: str, senha: str, papel: str, email: str = "") -> Usuario:
    if papel not in PAPEIS:
        raise ErroUsuario("Papel inválido.")
    if not login.strip() or " " in login.strip():
        raise ErroUsuario("O login não pode ter espaços.")
    validar_senha(senha)
    if (await session.execute(select(Usuario).where(Usuario.login == login.strip().lower()))).scalars().first():
        raise ErroUsuario("Já existe uma conta com esse login.")
    return await _novo(session, login, nome, senha, papel, email)


async def _coordenacoes_ativas(session: AsyncSession) -> int:
    return (await session.execute(
        select(func.count()).select_from(Usuario).where(Usuario.papel == "ADMIN", Usuario.ativo.is_(True))
    )).scalar_one()


async def atualizar(session: AsyncSession, usuario_id: str, *, nome: Optional[str] = None,
                    papel: Optional[str] = None, ativo: Optional[bool] = None) -> Usuario:
    usuario = await session.get(Usuario, usuario_id)
    if not usuario:
        raise ErroUsuario("Conta não encontrada.")
    if papel is not None and papel not in PAPEIS:
        raise ErroUsuario("Papel inválido.")
    deixa_de_coordenar = usuario.papel == "ADMIN" and usuario.ativo and (ativo is False or (papel and papel != "ADMIN"))
    if deixa_de_coordenar and await _coordenacoes_ativas(session) <= 1:
        raise ErroUsuario("O sistema precisa de pelo menos uma conta de coordenação ativa.")
    if nome is not None and nome.strip():
        usuario.nome = nome.strip()
    if papel is not None:
        usuario.papel = papel
    if ativo is not None:
        usuario.ativo = ativo
    await session.commit()
    return usuario


async def definir_senha(session: AsyncSession, usuario_id: str, nova: str, atual: Optional[str] = None) -> None:
    """Com 'atual', é a própria pessoa trocando; sem, é a coordenação redefinindo."""
    usuario = await session.get(Usuario, usuario_id)
    if not usuario:
        raise ErroUsuario("Conta não encontrada.")
    if atual is not None and not verify_password(atual, usuario.senha_hash):
        raise ErroUsuario("A senha atual está incorreta.")
    validar_senha(nova)
    usuario.senha_hash = hash_password(nova)
    await session.commit()
