"""
Banco de dados assíncrono (SQLAlchemy 2).
- Com DATABASE_URL (ex.: Postgres do docker-compose) usa esse banco.
- Sem configuração, usa um SQLite local em backend/triagens_dev.db, para o projeto rodar sem Docker.
As tabelas são criadas na primeira sessão aberta (não há migrations nesta fase do projeto).
"""
import os
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_SQLITE_PADRAO = "sqlite+aiosqlite:///" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "triagens_dev.db")


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.DATABASE_URL or _SQLITE_PADRAO)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
_tabelas_criadas = False


async def init_db() -> None:
    global _tabelas_criadas
    if _tabelas_criadas:
        return
    from app import models  # noqa: F401 (registra as tabelas no metadata)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    _tabelas_criadas = True


async def get_session() -> AsyncIterator[AsyncSession]:
    """Dependência do FastAPI."""
    await init_db()
    async with SessionLocal() as session:
        yield session


def abrir_sessao() -> AsyncSession:
    """Para uso fora de rotas (tarefas em background do webhook). Chame init_db() antes."""
    return SessionLocal()
