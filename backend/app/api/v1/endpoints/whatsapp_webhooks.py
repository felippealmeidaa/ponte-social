import hashlib
import hmac
import json
from typing import List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
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


async def process_whatsapp_message_background(phone: str, text: Optional[str], canal: str = "evolution", is_audio: bool = False,
                                              localizacao: Optional[Tuple[float, float]] = None):
    """Adaptador de canal → fluxo da conversa (grava o histórico) → envio da resposta pelo mesmo canal.
    Se um atendente assumiu a conversa, o fluxo não devolve respostas e o painel mostra a mensagem."""
    await init_db()
    async with abrir_sessao() as session:
        respostas = await processar_mensagem(session, phone, text, canal=canal, is_audio=is_audio, localizacao=localizacao)
    await _enviar(canal, phone, respostas)
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {"event": "NOVA_MENSAGEM", "conversa_id": hash_telefone(phone)})


def _token_evolution_valido(request: Request) -> bool:
    """A Evolution não assina os webhooks: usamos um token secreto na URL (?token=...) ou no
    cabeçalho X-Webhook-Token. Sem token configurado, só aceita em development."""
    esperado = settings.EVOLUTION_WEBHOOK_TOKEN
    if not esperado:
        return settings.ENVIRONMENT == "development"
    recebido = request.query_params.get("token") or request.headers.get("x-webhook-token") or ""
    return hmac.compare_digest(recebido, esperado)


def _assinatura_meta_valida(corpo: bytes, assinatura: str) -> bool:
    """A Meta assina cada webhook com HMAC-SHA256 do corpo usando o App Secret (X-Hub-Signature-256).
    Sem App Secret configurado, só aceita em development."""
    segredo = settings.META_APP_SECRET
    if not segredo:
        return settings.ENVIRONMENT == "development"
    esperado = "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(assinatura or "", esperado)


@router.post("/evolution")
async def webhook_evolution_api(request: Request, background_tasks: BackgroundTasks):
    """Receptor de webhooks da Evolution API v2 (evento messages.upsert)."""
    if not _token_evolution_valido(request):
        return Response(content="Token do webhook inválido", status_code=401)
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

    local = message_data.get("locationMessage") or message_data.get("liveLocationMessage")
    if local and local.get("degreesLatitude") is not None and local.get("degreesLongitude") is not None:
        ponto = (float(local["degreesLatitude"]), float(local["degreesLongitude"]))
        background_tasks.add_task(process_whatsapp_message_background, phone, None, "evolution", False, ponto)
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
    expected = settings.META_WEBHOOK_VERIFY_TOKEN
    if hub_mode == "subscribe" and expected and hub_verify_token and hmac.compare_digest(hub_verify_token, expected):
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(content="Token inválido", status_code=403)


@router.post("/meta")
async def webhook_meta_cloud(request: Request, background_tasks: BackgroundTasks):
    """Receptor da API oficial (WhatsApp Cloud). Mesmo fluxo; só muda o adaptador de envio."""
    corpo = await request.body()
    if not _assinatura_meta_valida(corpo, request.headers.get("x-hub-signature-256", "")):
        return Response(content="Assinatura inválida", status_code=401)
    body = json.loads(corpo or b"{}")
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                from_phone, msg_type = msg.get("from"), msg.get("type")
                if msg_type == "audio":
                    background_tasks.add_task(process_whatsapp_message_background, from_phone, None, "meta", True)
                    continue
                if msg_type == "location" and from_phone:
                    loc = msg.get("location", {})
                    if loc.get("latitude") is not None and loc.get("longitude") is not None:
                        ponto = (float(loc["latitude"]), float(loc["longitude"]))
                        background_tasks.add_task(process_whatsapp_message_background, from_phone, None, "meta", False, ponto)
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
    texto: str = Field(default="", max_length=4000)
    # Pino de localização, como o WhatsApp manda (o painel usa a localização do navegador)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


@router.post("/simular", dependencies=[Depends(usuario_logado)])
async def simular_conversa(req: SimulacaoRequest, session: AsyncSession = Depends(get_session)):
    """Conversa com o bot sem WhatsApp: mesmo fluxo e mesmo banco, mas devolve as respostas em vez
    de enviá-las. Serve para testes, para o painel e como plano B na apresentação."""
    localizacao = (req.latitude, req.longitude) if req.latitude is not None and req.longitude is not None else None
    if not req.texto.strip() and not localizacao:
        raise HTTPException(status_code=422, detail="Escreva uma mensagem ou envie uma localização.")
    respostas = await processar_mensagem(session, req.telefone, req.texto, canal="simulador", localizacao=localizacao)
    return {"respostas": respostas, "conversa_id": hash_telefone(req.telefone)}
