from fastapi import APIRouter, Depends
from app.core.config import settings
from app.core.deps import usuario_logado
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
    apps_workspace,
    atendimento,
    configuracao,
)

# ------------------------------------------------------------------------------
# Fase 1 (semestre): caminho WhatsApp → API → modelo → banco → painel do CRAS
# ------------------------------------------------------------------------------
api_router = APIRouter()

# Autenticação & Segurança
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticação & Segurança"])

# Triagem Social & CRAS (Operação)
api_router.include_router(triagem.router, prefix="/triagem", tags=["Triagem Social & CRAS"])

# Conversas (atendimento humano) e base de serviços editável
api_router.include_router(atendimento.router, prefix="/atendimento", tags=["Atendimento (conversas)"])
api_router.include_router(configuracao.router, prefix="/configuracao", tags=["Serviços e mensagens do bot"])

# Webhooks & Mensagens de Entrada
api_router.include_router(whatsapp_webhooks.router, prefix="/webhooks", tags=["WhatsApp Webhooks"])

# MLOps & Datasets
api_router.include_router(ml_studio.router, prefix="/ml", tags=["MLOps & Métricas de IA"])

# Instâncias WhatsApp & QR Code
api_router.include_router(whatsapp_instances.router, prefix="/whatsapp", tags=["Instâncias WhatsApp & QR Code"])

# ------------------------------------------------------------------------------
# Fase 2 (visão de produto): protótipos fora do escopo do semestre, com dados só
# em memória. Desligados por padrão; para demonstrar, defina HABILITAR_FASE2=true
# no .env (mesmo assim exigem login).
# ------------------------------------------------------------------------------
fase2_router = APIRouter()

# Visual Flow Builder (Orquestrador de Fluxos)
fase2_router.include_router(flows.router, prefix="/flows", tags=["Fase 2 · Visual Flow Builder"])

# AI Gateway & Inference Server (SVM + LLM, Roteador Híbrido)
fase2_router.include_router(ai_gateway.router, prefix="/models", tags=["Fase 2 · AI Gateway & Inferência"])

# Developer API Keys (Consumo Externo)
fase2_router.include_router(api_keys.router, prefix="/api-keys", tags=["Fase 2 · Developer API Keys"])

# Knowledge Base & RAG
fase2_router.include_router(knowledge_base.router, prefix="/knowledge", tags=["Fase 2 · Base de Conhecimento RAG"])

# Multi-App & Workspaces Multi-Nicho
fase2_router.include_router(apps_workspace.router, prefix="/apps", tags=["Fase 2 · Apps & Workspaces Multi-Nicho"])

if settings.HABILITAR_FASE2:
    api_router.include_router(fase2_router, dependencies=[Depends(usuario_logado)])
