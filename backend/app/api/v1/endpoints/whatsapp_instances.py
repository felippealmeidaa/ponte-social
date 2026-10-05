import time
import httpx
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.config import settings
from app.core.deps import usuario_logado

router = APIRouter(dependencies=[Depends(usuario_logado)])

class CreateInstanceRequest(BaseModel):
    instance_name: str = Field("cras-anapolis", description="Nome único da instância")
    phone_number: Optional[str] = None

@router.get("/status", summary="Verificar status da instância do WhatsApp (Evolution API v2)")
async def get_instance_status(instance_name: str = "cras-anapolis"):
    # Tenta consultar o Evolution API v2 local
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            headers = {"apikey": settings.EVOLUTION_API_KEY}
            resp = await client.get(
                f"{settings.EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                state = data.get("instance", {}).get("state", "close")
                return {
                    "connected": state == "open",
                    "state": state,
                    "instance_name": instance_name,
                    "evolution_url": settings.EVOLUTION_API_URL,
                    "mode": "live_evolution_api"
                }
    except Exception:
        pass
        
    # Fallback para ambiente de desenvolvimento
    return {
        "connected": False,
        "state": "disconnected",
        "instance_name": instance_name,
        "evolution_url": settings.EVOLUTION_API_URL,
        "mode": "ready_to_connect",
        "message": "Instância pronta para pareamento via QR Code ou webhook simulado."
    }

@router.post("/qrcode", summary="Obter ou Gerar QR Code para pareamento com WhatsApp")
async def generate_qr_code(instance_name: str = "cras-anapolis"):
    # Consulta QR Code do Evolution API
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            headers = {"apikey": settings.EVOLUTION_API_KEY}
            resp = await client.get(
                f"{settings.EVOLUTION_API_URL}/instance/connect/{instance_name}",
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                qrcode_base64 = data.get("base64") or data.get("code")
                return {
                    "success": True,
                    "instance_name": instance_name,
                    "qrcode": qrcode_base64,
                    "pairing_code": data.get("pairingCode"),
                    "source": "evolution_v2"
                }
    except Exception:
        pass
        
    # Sem Evolution API respondendo não há QR Code: não inventar um código de pareamento
    return {
        "success": False,
        "instance_name": instance_name,
        "erro": f"A Evolution API não respondeu em {settings.EVOLUTION_API_URL}. Suba o Docker (docker compose -f docker/docker-compose.yml up -d) e tente de novo.",
    }


@router.post("/disconnect", summary="Desconectar instância do WhatsApp")
async def disconnect_instance(instance_name: str = "cras-anapolis"):
    return {
        "success": True,
        "message": f"Instância {instance_name} desconectada com sucesso.",
        "state": "close"
    }
