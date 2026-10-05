from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def agora() -> datetime:
    return datetime.now(timezone.utc)


class Triagem(Base):
    """Uma triagem na fila do CRAS. Guarda só o necessário (plano, seção 10):
    relato anonimizado, categoria, prioridade e status; telefone mascarado + criptografado."""
    __tablename__ = "triagens"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    canal: Mapped[str] = mapped_column(String(20), default="web")  # whatsapp | web | demo

    nome_cidadao: Mapped[str] = mapped_column(String(120), default="Não identificado")
    telefone_mascarado: Mapped[str] = mapped_column(String(32), default="Não informado")
    telefone_cifrado: Mapped[str] = mapped_column(Text, default="")  # Fernet; só para o CRAS retornar o contato
    bairro: Mapped[str] = mapped_column(String(80), default="Não informado")
    cidade: Mapped[str] = mapped_column(String(80), default="Anápolis")

    relato_anonimizado: Mapped[str] = mapped_column(Text)
    categoria: Mapped[str] = mapped_column(String(40), index=True)
    categoria_modelo: Mapped[str] = mapped_column(String(40))  # o que o sistema sugeriu antes de qualquer correção
    categoria_confirmada_pelo_cidadao: Mapped[bool] = mapped_column(default=False)
    necessidades_secundarias: Mapped[list] = mapped_column(JSON, default=list)
    titulo_encaminhamento: Mapped[str] = mapped_column(String(160))
    prioridade: Mapped[str] = mapped_column(String(30), index=True)
    confianca: Mapped[float] = mapped_column(Float, default=0.0)
    metodo_decisao: Mapped[str] = mapped_column(String(120))
    servicos_recomendados: Mapped[list] = mapped_column(JSON, default=list)
    documentos_necessarios: Mapped[list] = mapped_column(JSON, default=list)

    status: Mapped[str] = mapped_column(String(30), default="PENDENTE", index=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consentiu_uso_para_treino: Mapped[bool] = mapped_column(default=False)


class Conversa(Base):
    """Estado da conversa de cada contato no WhatsApp (ver services/bot/fluxo_conversa.py).
    A chave é um hash do telefone, não o número."""
    __tablename__ = "conversas"

    telefone_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    estado: Mapped[str] = mapped_column(String(40))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    tentativas: Mapped[int] = mapped_column(Integer, default=0)
    relato: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # já anonimizado
    categoria_sugerida: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    categoria_escolhida: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    classificacao: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
