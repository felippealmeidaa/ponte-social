from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    triagem,
    whatsapp_webhooks,
    ml_studio,
    whatsapp_instances,
    atendimento,
    configuracao,
    equipe,
)

# ------------------------------------------------------------------------------
# Fase 1 (semestre): caminho WhatsApp → API → modelo → banco → painel do CRAS
# ------------------------------------------------------------------------------
api_router = APIRouter()

# Autenticação & Segurança
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticação & Segurança"])
api_router.include_router(equipe.router, prefix="/equipe", tags=["Equipe (contas do painel)"])

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
