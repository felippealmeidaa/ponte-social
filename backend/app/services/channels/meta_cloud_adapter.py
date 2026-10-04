import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings

class MetaCloudApiAdapter:
    def __init__(self, phone_number_id: Optional[str] = None, access_token: Optional[str] = None):
        self.phone_number_id = phone_number_id or settings.META_PHONE_NUMBER_ID
        self.access_token = access_token or settings.META_WHATSAPP_TOKEN
        self.version = settings.META_API_VERSION
        self.base_url = f"https://graph.facebook.com/{self.version}/{self.phone_number_id}"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    async def send_text_message(self, to_phone: str, text: str) -> Dict[str, Any]:
        """Envia mensagem de texto via WhatsApp Cloud API Oficial"""
        url = f"{self.base_url}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "text",
            "text": {"preview_url": False, "body": text}
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def send_interactive_buttons(self, to_phone: str, body_text: str, buttons: List[Dict[str, str]]) -> Dict[str, Any]:
        """Envia mensagem interativa com botões oficiais da Meta"""
        url = f"{self.base_url}/messages"
        formatted_buttons = [
            {
                "type": "reply",
                "reply": {
                    "id": btn.get("id", f"btn_{i}"),
                    "title": btn.get("title", f"Opção {i+1}")[:20]
                }
            }
            for i, btn in enumerate(buttons)
        ]
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "action": {"buttons": formatted_buttons}
            }
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self.headers)
                return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
