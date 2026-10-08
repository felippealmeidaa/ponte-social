"""
Retorno dias depois: quem recebeu a orientação mas não quis contato do CRAS recebe, depois de "retorno_dias" (Gestão › Alertas),
"conseguiu ir ao CRAS?". Se ainda não foi, pode pedir que o CRAS entre em contato (o caso entra na fila).
Recupera quem desistiu no meio do caminho.

O agendamento é feito em fluxo_conversa._agendar_acompanhamento (nunca em violência; cada CRAS pode desligar
em "perguntar_depois"). A resposta (1, 2 ou 3) é tratada no fluxo da conversa.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Conversa, Mensagem, agora
from app.services import catalogo
from app.services.avisos import NOME_ASSUNTO
from app.services.channels.envio import enviar_pelo_canal
from app.services.llm.traducao import traduzir

log = logging.getLogger(__name__)
INTERVALO_MIN = 30
# Não interrompe quem está no meio de outra conversa com o bot
CONVERSA_ATIVA = timedelta(minutes=30)


def _vencido(acomp: dict, momento: datetime) -> bool:
    try:
        em = datetime.fromisoformat(acomp["em"])
    except (KeyError, TypeError, ValueError):
        return False
    return not acomp.get("enviado") and (em if em.tzinfo else em.replace(tzinfo=momento.tzinfo)) <= momento


async def enviar_pendentes(session: AsyncSession, momento: Optional[datetime] = None) -> int:
    """Envia os retornos vencidos. Devolve quantos foram enviados."""
    momento = momento or agora()
    conversas = (await session.execute(select(Conversa).where(Conversa.acompanhamento.is_not(None)))).scalars().all()
    enviados = 0
    for c in conversas:
        acomp = c.acompanhamento or {}
        if not _vencido(acomp, momento) or not c.consentiu_em or c.atendimento_humano:
            continue
        ultima = c.atualizado_em.replace(tzinfo=momento.tzinfo) if c.atualizado_em and not c.atualizado_em.tzinfo else c.atualizado_em
        if ultima and momento - ultima < CONVERSA_ATIVA and c.estado not in ("FINALIZADA",):
            continue
        texto = catalogo.texto("acompanhamento", c.unidade_id).replace("{assunto}", NOME_ASSUNTO.get(acomp.get("categoria"), "o seu pedido"))
        enviado = (await traduzir([texto], "es"))[0] if c.idioma == "es" else texto
        if not await enviar_pelo_canal(c, enviado):
            continue  # tenta de novo na próxima rodada
        session.add(Mensagem(conversa_id=c.telefone_hash, autor="bot", texto=enviado, traducao=texto if texto != enviado else None))
        c.acompanhamento = {**acomp, "enviado": True}
        c.estado, c.atualizado_em = "AGUARDANDO_ACOMPANHAMENTO", momento
        enviados += 1
    await session.commit()
    return enviados


async def rodar_periodicamente() -> None:
    """Tarefa de fundo do servidor: confere os retornos a cada INTERVALO_MIN."""
    from app.db import abrir_sessao, init_db
    while True:
        await asyncio.sleep(INTERVALO_MIN * 60)
        try:
            await init_db()
            async with abrir_sessao() as session:
                n = await enviar_pendentes(session)
                from app.services import agenda, documentos  # nesta rodada também: lembretes e fotos vencidas
                await agenda.enviar_lembretes(session)
                await documentos.aplicar_retencao(session)
            if n:
                log.info("Retornos enviados: %s", n)
        except Exception as e:  # nunca derruba o servidor
            log.warning("Falha ao enviar retornos: %s", e)
