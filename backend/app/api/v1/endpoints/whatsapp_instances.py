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

def _resposta_qr(instance_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    # /instance/connect devolve o QR na raiz; /instance/create devolve dentro de "qrcode"
    qr = data.get("qrcode") if isinstance(data.get("qrcode"), dict) else data
    return {
        "success": True,
        "instance_name": instance_name,
        "qrcode": qr.get("base64") or qr.get("code"),
        "pairing_code": qr.get("pairingCode"),
        "source": "evolution_v2",
    }


@router.post("/qrcode", summary="Obter ou Gerar QR Code para pareamento com WhatsApp")
async def generate_qr_code(instance_name: str = "cras-anapolis"):
    headers = {"apikey": settings.EVOLUTION_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.EVOLUTION_API_URL}/instance/connect/{instance_name}",
                headers=headers,
            )
            # Primeira vez: a instância ainda não existe na Evolution, então é criada já pedindo o QR
            if resp.status_code == 404:
                resp = await client.post(
                    f"{settings.EVOLUTION_API_URL}/instance/create",
                    headers=headers,
                    json={"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True},
                )
            if resp.status_code in (200, 201):
                return _resposta_qr(instance_name, resp.json())
            if resp.status_code in (401, 403):
                erro = "A Evolution API recusou a chave. Confira EVOLUTION_API_KEY no backend/.env."
            else:
                erro = f"A Evolution API respondeu com erro {resp.status_code}: {resp.text[:200]}"
    except httpx.HTTPError:
        erro = (
            f"A Evolution API não respondeu em {settings.EVOLUTION_API_URL}. "
            "Suba o Docker (docker compose --env-file backend/.env -f docker/docker-compose.yml up -d) e tente de novo."
        )

    # Sem QR Code da Evolution: não inventar um código de pareamento
    return {"success": False, "instance_name": instance_name, "erro": erro}


@router.post("/disconnect", summary="Desconectar instância do WhatsApp")
async def disconnect_instance(instance_name: str = "cras-anapolis"):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(
                f"{settings.EVOLUTION_API_URL}/instance/logout/{instance_name}",
                headers={"apikey": settings.EVOLUTION_API_KEY},
            )
        if resp.status_code in (200, 201):
            return {"success": True, "message": f"Instância {instance_name} desconectada.", "state": "close"}
        return {"success": False, "message": f"A Evolution API respondeu com erro {resp.status_code}: {resp.text[:200]}"}
    except httpx.HTTPError:
        return {"success": False, "message": f"A Evolution API não respondeu em {settings.EVOLUTION_API_URL}."}
