from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import usuario_logado
from app.db import abrir_sessao, get_session, init_db
from app.services.anonimizacao import hash_telefone
from app.services.bot.fluxo_conversa import processar_mensagem
from app.services.channels.evolution_adapter import EvolutionApiAdapter
from app.services.channels.meta_cloud_adapter import MetaCloudApiAdapter
from app.services.live_chat.manager import live_chat_manager
from app.services.triagens import TENANT_PADRAO

router = APIRouter()
evolution_adapter = EvolutionApiAdapter()
meta_adapter = MetaCloudApiAdapter()


async def _enviar(canal: str, telefone: str, mensagens: List[str]) -> None:
    for texto in mensagens:
        if canal == "meta":
            await meta_adapter.send_text_message(telefone, texto)
        else:
            await evolution_adapter.send_text_message(settings.EVOLUTION_INSTANCE_NAME, telefone, texto)


async def process_whatsapp_message_background(phone: str, text: Optional[str], canal: str = "evolution", is_audio: bool = False):
    """Adaptador de canal → fluxo da conversa (grava o histórico) → envio da resposta pelo mesmo canal.
    Se um atendente assumiu a conversa, o fluxo não devolve respostas e o painel mostra a mensagem."""
    await init_db()
    async with abrir_sessao() as session:
        respostas = await processar_mensagem(session, phone, text, canal=canal, is_audio=is_audio)
    await _enviar(canal, phone, respostas)
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {"event": "NOVA_MENSAGEM", "conversa_id": hash_telefone(phone)})


@router.post("/evolution")
async def webhook_evolution_api(request: Request, background_tasks: BackgroundTasks):
    """Receptor de webhooks da Evolution API v2 (evento messages.upsert)."""
    payload = await request.json()
    if payload.get("event") != "messages.upsert":
        return {"status": "ignored_event"}

    data = payload.get("data", {})
    key_data = data.get("key", {})
    remote_jid = key_data.get("remoteJid", "")
    # Ignora o próprio bot, grupos e status: o bot só responde a quem escreveu direto para ele
    if key_data.get("fromMe", False) or not remote_jid.endswith("@s.whatsapp.net"):
        return {"status": "ignored"}

    phone = remote_jid.split("@")[0]
    message_data = data.get("message", {}) or {}
    if "audioMessage" in message_data:
        background_tasks.add_task(process_whatsapp_message_background, phone, None, "evolution", True)
        return {"status": "received"}

    text = (
        message_data.get("conversation")
        or message_data.get("extendedTextMessage", {}).get("text")
        or message_data.get("buttonsResponseMessage", {}).get("selectedDisplayText")
        or message_data.get("listResponseMessage", {}).get("title")
        or ""
    )
    if text:
        background_tasks.add_task(process_whatsapp_message_background, phone, text, "evolution")
    return {"status": "received"}


@router.get("/meta")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Verificação de webhook exigida pela Meta Graph API."""
    if hub_mode == "subscribe" and hub_verify_token == settings.META_WEBHOOK_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(content="Token inválido", status_code=403)


@router.post("/meta")
async def webhook_meta_cloud(request: Request, background_tasks: BackgroundTasks):
    """Receptor da API oficial (WhatsApp Cloud). Mesmo fluxo; só muda o adaptador de envio."""
    body = await request.json()
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                from_phone, msg_type = msg.get("from"), msg.get("type")
                if msg_type == "audio":
                    background_tasks.add_task(process_whatsapp_message_background, from_phone, None, "meta", True)
                    continue
                text = ""
                if msg_type == "text":
                    text = msg.get("text", {}).get("body", "")
                elif msg_type == "interactive":
                    text = msg.get("interactive", {}).get("button_reply", {}).get("title", "")
                if text and from_phone:
                    background_tasks.add_task(process_whatsapp_message_background, from_phone, text, "meta")
    return {"status": "success"}


class SimulacaoRequest(BaseModel):
    telefone: str = Field(default="5562900000000", description="Número fictício que identifica a conversa simulada")
    texto: str = Field(min_length=1, max_length=4000)


@router.post("/simular", dependencies=[Depends(usuario_logado)])
async def simular_conversa(req: SimulacaoRequest, session: AsyncSession = Depends(get_session)):
    """Conversa com o bot sem WhatsApp: mesmo fluxo e mesmo banco, mas devolve as respostas em vez
    de enviá-las. Serve para testes, para o painel e como plano B na apresentação."""
    respostas = await processar_mensagem(session, req.telefone, req.texto, canal="simulador")
    return {"respostas": respostas, "conversa_id": hash_telefone(req.telefone)}
