import time
import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

APPS_DB: List[Dict[str, Any]] = [
    {
        "id": "social-cras",
        "name": "CRAS & Assistência Social (Anápolis)",
        "slug": "social-cras",
        "niche": "Setor Público & Assistência Social",
        "description": "Triagem automatizada, protocolo de emergência Maria da Penha (ODS 16), CadÚnico e agendamentos CRAS.",
        "icon": "HeartHandshake",
        "color": "emerald",
        "active_model": "Linear SVM + gemini-3.5-flash-lite",
        "status": "production",
        "total_flows": 3,
        "total_contacts": 116240,
        "created_at": "2026-10-01"
    },
    {
        "id": "licitacao-anapolis",
        "name": "Prefeitura & Licitações Públicas",
        "slug": "licitacao-anapolis",
        "niche": "Governo & Licitações",
        "description": "Análise de editais municipais, prazos de pregão eletrônico, certidões negativas e Lei 14.133/2021.",
        "icon": "FileText",
        "color": "sky",
        "active_model": "gemini-3.5-flash-lite + RAG Vetorial",
        "status": "active",
        "total_flows": 2,
        "total_contacts": 450,
        "created_at": "2026-10-03"
    },
    {
        "id": "saude-triagem",
        "name": "Saúde & Agendamento UBS",
        "slug": "saude-triagem",
        "niche": "Saúde Pública",
        "description": "Pré-triagem de sintomas, agendamento de consultas básicas e lembretes de vacinação via WhatsApp.",
        "icon": "Activity",
        "color": "blue",
        "active_model": "Linear SVM Híbrido",
        "status": "active",
        "total_flows": 1,
        "total_contacts": 890,
        "created_at": "2026-10-04"
    }
]

class CreateAppRequest(BaseModel):
    name: str = Field(..., description="Nome do novo App/Workspace")
    niche: str = Field(..., description="Nicho de atuação (ex: Jurídico, Vendas, Saúde)")
    description: str = Field(..., description="Objetivo do aplicativo e regras de atendimento")
    icon: Optional[str] = "Sparkles"
    color: Optional[str] = "sky"
    active_model: Optional[str] = "gemini-3.5-flash-lite"

@router.get("", summary="Listar todos os Apps/Nichos do Servidor de IA")
async def list_apps():
    return {
        "apps": APPS_DB,
        "total": len(APPS_DB),
        "active_app_id": "social-cras"
    }

@router.post("", summary="Criar novo App/Nicho no Servidor de IA")
async def create_app(req: CreateAppRequest):
    app_id = req.name.lower().replace(" ", "-").replace("&", "e")[:20] + f"-{uuid.uuid4().hex[:4]}"
    new_app = {
        "id": app_id,
        "name": req.name,
        "slug": app_id,
        "niche": req.niche,
        "description": req.description,
        "icon": req.icon,
        "color": req.color,
        "active_model": req.active_model,
        "status": "active",
        "total_flows": 1,
        "total_contacts": 0,
        "created_at": time.strftime("%Y-%m-%d")
    }
    APPS_DB.append(new_app)
    return {
        "success": True,
        "message": f"App '{req.name}' provisionado com sucesso no Servidor de IA.",
        "app": new_app
    }
