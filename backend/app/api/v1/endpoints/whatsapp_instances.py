import asyncio
import httpx
from typing import List, Dict, Any, Optional, Tuple
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
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            headers = {"apikey": settings.EVOLUTION_API_KEY}
            resp = await client.get(
                f"{settings.EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                state = data.get("instance", {}).get("state", "close")
                connected = (state == "open")
                perfil = None
                
                # Se conectado, tenta obter o perfil/número
                if connected:
                    try:
                        resp_info = await client.get(
                            f"{settings.EVOLUTION_API_URL}/instance/fetchInstances",
                            headers=headers
                        )
                        if resp_info.status_code == 200:
                            for inst in resp_info.json():
                                if inst.get("name") == instance_name:
                                    perfil = inst.get("profileName") or inst.get("ownerJid", "").split("@")[0]
                                    break
                    except Exception:
                        pass

                return {
                    "connected": connected,
                    "state": state,
                    "profile_name": perfil,
                    "instance_name": instance_name,
                    "evolution_url": settings.EVOLUTION_API_URL,
                    "mode": "live_evolution_api"
                }
    except Exception:
        pass
        
    return {
        "connected": False,
        "state": "disconnected",
        "instance_name": instance_name,
        "evolution_url": settings.EVOLUTION_API_URL,
        "mode": "ready_to_connect",
        "message": "Instância pronta para pareamento via QR Code ou webhook simulado."
    }

def _extrair_qr(data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    qr = data.get("qrcode") if isinstance(data.get("qrcode"), dict) else data
    b64 = qr.get("base64")
    code = qr.get("code")
    pairing = qr.get("pairingCode")
    return (b64 or code), pairing


import time

@router.post("/qrcode", summary="Obter ou Gerar QR Code para pareamento com WhatsApp")
async def generate_qr_code(instance_name: str = "cras-anapolis"):
    from app.api.v1.endpoints.whatsapp_webhooks import ultimo_qrcode

    headers = {"apikey": settings.EVOLUTION_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Primeiro verifica o estado atual
            try:
                state_resp = await client.get(
                    f"{settings.EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
                    headers=headers
                )
                if state_resp.status_code == 200:
                    st = state_resp.json().get("instance", {}).get("state", "close")
                    if st == "open":
                        return {
                            "success": True,
                            "connected": True,
                            "state": "open",
                            "message": "O WhatsApp já está conectado! Se deseja conectar outro aparelho, clique em 'Desconectar' primeiro."
                        }
            except Exception:
                pass

            # 2. Se já tivermos um QR Code recente no cache do webhook (menos de 60s)
            cached = ultimo_qrcode.get(instance_name)
            if cached and (time.time() - cached.get("timestamp", 0) < 60) and cached.get("qrcode"):
                return {
                    "success": True,
                    "instance_name": instance_name,
                    "qrcode": cached["qrcode"],
                    "pairing_code": cached.get("pairing_code"),
                    "source": "evolution_v2_webhook",
                }

            # 3. Tenta conectar na instância existente para ver se já entrega o QR Code
            try:
                for _ in range(4):
                    connect_resp = await client.get(
                        f"{settings.EVOLUTION_API_URL}/instance/connect/{instance_name}",
                        headers=headers
                    )
                    if connect_resp.status_code == 200:
                        qr, pairing = _extrair_qr(connect_resp.json())
                        if qr:
                            ultimo_qrcode[instance_name] = {"qrcode": qr, "pairing_code": pairing, "timestamp": time.time()}
                            return {
                                "success": True,
                                "instance_name": instance_name,
                                "qrcode": qr,
                                "pairing_code": pairing,
                                "source": "evolution_v2_connect",
                            }
                    elif connect_resp.status_code == 404:
                        break

                    # Verifica se o webhook gravou o QR Code
                    cached = ultimo_qrcode.get(instance_name)
                    if cached and (time.time() - cached.get("timestamp", 0) < 60) and cached.get("qrcode"):
                        return {
                            "success": True,
                            "instance_name": instance_name,
                            "qrcode": cached["qrcode"],
                            "pairing_code": cached.get("pairing_code"),
                            "source": "evolution_v2_webhook",
                        }

                    await asyncio.sleep(1.0)
            except Exception:
                pass

            # 4. Se não veio pelo connect ou a instância não existe, recria de forma limpa
            try:
                await client.delete(f"{settings.EVOLUTION_API_URL}/instance/delete/{instance_name}", headers=headers)
                await asyncio.sleep(0.6)
            except Exception:
                pass

            create_resp = await client.post(
                f"{settings.EVOLUTION_API_URL}/instance/create",
                headers=headers,
                json={"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True}
            )

            if create_resp.status_code in (200, 201):
                data = create_resp.json()
                qrcode_str, pairing_code = _extrair_qr(data)

                if qrcode_str:
                    ultimo_qrcode[instance_name] = {
                        "qrcode": qrcode_str,
                        "pairing_code": pairing_code,
                        "timestamp": time.time()
                    }
                    return {
                        "success": True,
                        "instance_name": instance_name,
                        "qrcode": qrcode_str,
                        "pairing_code": pairing_code,
                        "source": "evolution_v2_direct",
                    }

                # Aguarda até 8 segundos consultando o connect e o webhook
                for _ in range(8):
                    await asyncio.sleep(1.0)
                    # 1. Consulta connect direto
                    try:
                        poll_resp = await client.get(
                            f"{settings.EVOLUTION_API_URL}/instance/connect/{instance_name}",
                            headers=headers
                        )
                        if poll_resp.status_code == 200:
                            qr, pairing = _extrair_qr(poll_resp.json())
                            if qr:
                                ultimo_qrcode[instance_name] = {"qrcode": qr, "pairing_code": pairing, "timestamp": time.time()}
                                return {
                                    "success": True,
                                    "instance_name": instance_name,
                                    "qrcode": qr,
                                    "pairing_code": pairing,
                                    "source": "evolution_v2_connect",
                                }
                    except Exception:
                        pass

                    # 2. Verifica se o webhook capturou
                    cached = ultimo_qrcode.get(instance_name)
                    if cached and (time.time() - cached.get("timestamp", 0) < 60) and cached.get("qrcode"):
                        return {
                            "success": True,
                            "instance_name": instance_name,
                            "qrcode": cached["qrcode"],
                            "pairing_code": cached.get("pairing_code"),
                            "source": "evolution_v2_webhook",
                        }

                erro = "Instância criada, mas o QR Code ainda está inicializando. Clique em 'Gerar QR Code' novamente."
            elif create_resp.status_code in (401, 403):
                erro = "A Evolution API recusou a chave. Confira EVOLUTION_API_KEY no backend/.env."
            else:
                erro = f"A Evolution API respondeu com erro {create_resp.status_code}: {create_resp.text[:200]}"
    except httpx.HTTPError:
        erro = (
            f"A Evolution API não respondeu em {settings.EVOLUTION_API_URL}. "
            "Verifique se os containers Docker estão em execução."
        )

    return {"success": False, "instance_name": instance_name, "erro": erro}


@router.post("/disconnect", summary="Desconectar e resetar instância do WhatsApp")
async def disconnect_instance(instance_name: str = "cras-anapolis"):
    from app.api.v1.endpoints.whatsapp_webhooks import ultimo_qrcode
    ultimo_qrcode.pop(instance_name, None)
    headers = {"apikey": settings.EVOLUTION_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Tenta logout
            try:
                await client.delete(
                    f"{settings.EVOLUTION_API_URL}/instance/logout/{instance_name}",
                    headers=headers,
                )
            except Exception:
                pass

            # Deleta a instância para desvincular qualquer sessão presa
            try:
                await client.delete(
                    f"{settings.EVOLUTION_API_URL}/instance/delete/{instance_name}",
                    headers=headers
                )
            except Exception:
                pass

            # Recria a instância limpa
            try:
                resp = await client.post(
                    f"{settings.EVOLUTION_API_URL}/instance/create",
                    headers=headers,
                    json={"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True}
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    qr, pairing = _extrair_qr(data)
                    if qr:
                        ultimo_qrcode[instance_name] = {
                            "qrcode": qr,
                            "pairing_code": pairing,
                            "timestamp": time.time()
                        }
            except Exception:
                pass

            return {
                "success": True,
                "message": f"Instância {instance_name} desconectada e reiniciada com sucesso. Pronto para novo pareamento.",
                "state": "close"
            }
    except Exception as e:
        return {"success": False, "message": f"Erro ao desconectar: {str(e)}"}

