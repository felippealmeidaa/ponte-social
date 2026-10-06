import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings

class EvolutionApiAdapter:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or settings.EVOLUTION_API_URL).rstrip('/')
        self.api_key = api_key or settings.EVOLUTION_API_KEY
        self.headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json"
        }

    async def send_text_message(self, instance: str, number: str, text: str) -> Dict[str, Any]:
        """Envia mensagem de texto simples pelo WhatsApp via Evolution API"""
        url = f"{self.base_url}/message/sendText/{instance}"
        payload = {
            "number": number,
            "text": text,
            "options": {
                "delay": 1200,
                "presence": "composing",
                "linkPreview": True
            }
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def get_media_base64(self, instance: str, mensagem: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """Baixa a mídia (áudio) de uma mensagem recebida. mensagem = o "data" do webhook messages.upsert.
        Devolve {"base64", "mimetype"} ou None."""
        url = f"{self.base_url}/chat/getBase64FromMediaMessage/{instance}"
        payload = {"message": {"key": mensagem.get("key", {}), "message": mensagem.get("message", {})}, "convertToMp4": False}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
            dados = response.json() if response.status_code in (200, 201) else {}
            if dados.get("base64"):
                return {"base64": dados["base64"], "mimetype": dados.get("mimetype") or "audio/ogg"}
        except Exception:
            pass
        return None

    async def send_buttons_message(self, instance: str, number: str, title: str, description: str, buttons: List[Dict[str, str]]) -> Dict[str, Any]:
        """Envia mensagem com botões interativos para confirmação de triagem"""
        url = f"{self.base_url}/message/sendButtons/{instance}"
        payload = {
            "number": number,
            "title": title,
            "description": description,
            "buttons": buttons
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def create_instance(self, instance_name: str) -> Dict[str, Any]:
        """Cria e inicializa uma nova instância de WhatsApp na Evolution API"""
        url = f"{self.base_url}/instance/create"
        payload = {
            "instanceName": instance_name,
            "token": self.api_key,
            "qrcode": True
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def get_qrcode(self, instance_name: str) -> Dict[str, Any]:
        """Obtém o QR Code da instância para conexão no WhatsApp"""
        url = f"{self.base_url}/instance/connect/{instance_name}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
