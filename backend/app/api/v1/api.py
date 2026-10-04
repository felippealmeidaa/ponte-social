from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    triagem,
    whatsapp_webhooks,
    flows,
    ml_studio,
    ai_gateway,
    api_keys,
    knowledge_base,
    whatsapp_instances,
    apps_workspace
)

api_router = APIRouter()

# Autenticação & Segurança
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticação & Segurança"])

# Triagem Social & CRAS (Operação)
api_router.include_router(triagem.router, prefix="/triagem", tags=["Triagem Social & CRAS"])

# Webhooks & Mensagens de Entrada
api_router.include_router(whatsapp_webhooks.router, prefix="/webhooks", tags=["WhatsApp Webhooks"])

# Visual Flow Builder (Orquestrador de Fluxos)
api_router.include_router(flows.router, prefix="/flows", tags=["Visual Flow Builder"])

# MLOps & Datasets
api_router.include_router(ml_studio.router, prefix="/ml", tags=["MLOps & Métricas de IA"])

# AI Gateway & Inference Server (SVM, Gemini 3.5 Flash Lite, Roteador Híbrido)
api_router.include_router(ai_gateway.router, prefix="/models", tags=["AI Gateway & Inferência"])

# Developer API Keys (Consumo Externo)
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["Developer API Keys"])

# Knowledge Base & RAG Vetorial
api_router.include_router(knowledge_base.router, prefix="/knowledge", tags=["Base de Conhecimento RAG"])

# Instâncias WhatsApp & QR Code
api_router.include_router(whatsapp_instances.router, prefix="/whatsapp", tags=["Instâncias WhatsApp & QR Code"])

# Multi-App & Workspaces Multi-Nicho
api_router.include_router(apps_workspace.router, prefix="/apps", tags=["Apps & Workspaces Multi-Nicho"])
