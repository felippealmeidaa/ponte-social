from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.db import abrir_sessao, init_db
from app.services.live_chat.manager import live_chat_manager
from app.services import catalogo, usuarios
from app.services.triagens import aplicar_retencao, popular_demo_se_vazio


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with abrir_sessao() as session:
        await catalogo.carregar(session)
        aviso = await usuarios.garantir_usuario_inicial(session)
        if aviso:
            print(f"[CONTAS] {aviso}")
        apagadas = await aplicar_retencao(session)
        if apagadas:
            print(f"[LGPD] {apagadas} triagens apagadas por passarem do prazo de retenção.")
        await popular_demo_se_vazio(session)
    yield


app = FastAPI(
    lifespan=lifespan,
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
        # Só notificações do servidor para o painel; assumir/devolver conversa é feito pelas rotas /atendimento
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        live_chat_manager.disconnect(websocket, tenant_id)
