import json
from fastapi import APIRouter, Request, Response, Query, BackgroundTasks
from app.services.ml.classifier_service import SocialClassifierService
from app.services.channels.evolution_adapter import EvolutionApiAdapter
from app.services.channels.meta_cloud_adapter import MetaCloudApiAdapter
from app.services.live_chat.manager import live_chat_manager
from app.api.v1.endpoints.triagem import submeter_triagem, TriagemRequest
from app.core.config import settings

router = APIRouter()
evolution_adapter = EvolutionApiAdapter()
meta_adapter = MetaCloudApiAdapter()

async def process_whatsapp_message_background(phone: str, text: str, instance_name: str = "cras_anapolis"):
    # 1. Verifica se a conversa está pausada por atendimento humano (Live Chat)
    if live_chat_manager.is_bot_paused(phone):
        # Apenas retransmite a mensagem para o WebSocket do atendente humano
        await live_chat_manager.broadcast_to_tenant("cras-anapolis-01", {
            "event": "NOVA_MENSAGEM_CHAT",
            "phone": phone,
            "sender": "CONTACT",
            "text": text
        })
        return

    # 2. Transmite mensagem para o inbox do painel
    await live_chat_manager.broadcast_to_tenant("cras-anapolis-01", {
        "event": "NOVA_MENSAGEM_CHAT",
        "phone": phone,
        "sender": "CONTACT",
        "text": text
    })

    # 3. Classificação e Triagem com IA
    resultado = SocialClassifierService.classify_relato(text)
    
    # Se for violência, resposta imediata de emergência
    if resultado["is_urgente"]:
        msg_resposta = (
            "🚨 *ATENDIMENTO EMERGENCIAL DE PROTEÇÃO SOCIAL*\n\n"
            "Identificamos uma situação prioritária de segurança e proteção.\n\n"
            "📞 *Canais de Socorro Imediato:*\n"
            "• Emergência Policial: *Ligue 190*\n"
            "• Violência contra a Mulher: *Ligue 180*\n"
            "• Direitos Humanos (Crianças/Idosos): *Disque 100*\n"
            "• CREAS Anápolis: *Atendimento Prioritário Presencial*\n\n"
            "Sua mensagem foi sinalizada com prioridade máxima para a equipe especializada."
        )
        await evolution_adapter.send_text_message(instance_name, phone, msg_resposta)
        
        # Insere na fila do CRAS/CREAS
        await submeter_triagem(TriagemRequest(
            relato=text,
            nome="Cidadão (WhatsApp)",
            telefone=phone
        ))
        return

    # Fluxo Padrão de Orientação Social
    docs_formatados = "\n".join([f"• {doc}" for doc in resultado["documentos_necessarios"]])
    servicos_formatados = "\n".join([f"• {srv}" for doc in resultado["servicos_recomendados"] for srv in [doc]])

    msg_resposta = (
        f"Olá! Sou a assistente virtual de Encaminhamento Social.\n\n"
        f"📋 *Identificação da Demanda:* {resultado['titulo_encaminhamento']}\n\n"
        f"🏛 *Onde Procurar Atendimento:*\n{resultado['local_atendimento']}\n\n"
        f"📄 *Documentos Necessários:*\n{docs_formatados}\n\n"
        f"ℹ️ *Próximo Passo:* Você gostaria de confirmar esse encaminhamento e enviar para a fila da equipe do CRAS?"
    )

    botoes = [
        {"id": "btn_confirmar", "title": "✅ Sim, confirmar"},
        {"id": "btn_outro", "title": "🔄 Outro assunto"}
    ]

    # Envia via Evolution API com botões interativos
    try:
        await evolution_adapter.send_buttons_message(
            instance=instance_name,
            number=phone,
            title="Encaminhamento Social Inteligente",
            description=msg_resposta,
            buttons=botoes
        )
    except Exception:
        await evolution_adapter.send_text_message(instance_name, phone, msg_resposta)

    # Registra a triagem no sistema
    await submeter_triagem(TriagemRequest(
        relato=text,
        nome="Cidadão (WhatsApp)",
        telefone=phone
    ))

@router.post("/evolution")
async def webhook_evolution_api(request: Request, background_tasks: BackgroundTasks):
    """Receptor oficial de Webhooks da Evolution API v2"""
    payload = await request.json()
    
    event_type = payload.get("event")
    data = payload.get("data", {})
    
    if event_type == "messages.upsert":
        message_data = data.get("message", {})
        key_data = data.get("key", {})
        
        # Ignora mensagens enviadas pelo próprio bot
        if key_data.get("fromMe", False):
            return {"status": "ignored_self"}
        
        remote_jid = key_data.get("remoteJid", "")
        phone = remote_jid.split("@")[0] if "@" in remote_jid else remote_jid
        
        # Extrai o texto da mensagem (suporte a texto simples, botões e conversas)
        text = (
            message_data.get("conversation") or
            message_data.get("extendedTextMessage", {}).get("text") or
            message_data.get("buttonsResponseMessage", {}).get("selectedDisplayText") or
            message_data.get("listResponseMessage", {}).get("title") or
            ""
        )
        
        if text and phone:
            background_tasks.add_task(process_whatsapp_message_background, phone, text)
            
    return {"status": "received"}

@router.get("/meta")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    """Verificação de Webhook obrigatória exigida pela Meta Graph API"""
    if hub_mode == "subscribe" and hub_verify_token == settings.META_WEBHOOK_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(content="Token inválido", status_code=403)

@router.post("/meta")
async def webhook_meta_cloud(request: Request, background_tasks: BackgroundTasks):
    """Receptor de mensagens da API Oficial do WhatsApp Cloud"""
    body = await request.json()
    entry = body.get("entry", [])
    if entry:
        changes = entry[0].get("changes", [])
        if changes:
            value = changes[0].get("value", {})
            messages = value.get("messages", [])
            if messages:
                msg = messages[0]
                from_phone = msg.get("from")
                msg_type = msg.get("type")
                text = ""
                if msg_type == "text":
                    text = msg.get("text", {}).get("body", "")
                elif msg_type == "interactive":
                    text = msg.get("interactive", {}).get("button_reply", {}).get("title", "")
                
                if text and from_phone:
                    background_tasks.add_task(process_whatsapp_message_background, from_phone, text)

    return {"status": "success"}
