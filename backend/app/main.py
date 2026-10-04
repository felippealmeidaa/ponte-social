from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.services.live_chat.manager import live_chat_manager

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Plataforma Omnichannel de Atendimento Inteligente & CRM Social com IA Híbrida",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuração de CORS rigoroso
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusão das rotas da API
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def health_check():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/docs"
    }

# Endpoint WebSocket para o Live Chat do CRAS e Inbox em tempo real
@app.websocket("/ws/chat/{tenant_id}")
async def websocket_chat_endpoint(websocket: WebSocket, tenant_id: str):
    await live_chat_manager.connect(websocket, tenant_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Processa mensagens vindas do atendente do painel web
            # Ex: {"action": "SEND_MESSAGE", "phone": "556299999999", "text": "Olá"}
            try:
                msg_json = json.loads(data)
                action = msg_json.get("action")
                if action == "PAUSE_BOT":
                    phone = msg_json.get("phone")
                    live_chat_manager.pause_bot_for_contact(phone, agent_id="operador-cras")
                elif action == "RESUME_BOT":
                    phone = msg_json.get("phone")
                    live_chat_manager.resume_bot_for_contact(phone)
            except Exception:
                pass
    except WebSocketDisconnect:
        live_chat_manager.disconnect(websocket, tenant_id)
