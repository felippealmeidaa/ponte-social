"""Envio de mensagens do bot pelo mesmo canal por onde a pessoa escreveu (Evolution ou API oficial da Meta)."""
import logging
from typing import List

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models import Conversa
from app.services.channels.evolution_adapter import EvolutionApiAdapter
from app.services.channels.meta_cloud_adapter import MetaCloudApiAdapter

log = logging.getLogger(__name__)
evolution_adapter = EvolutionApiAdapter()
meta_adapter = MetaCloudApiAdapter()


async def enviar_pelo_canal(conversa: Conversa, texto: str) -> bool:
    """Envia pelo mesmo canal em que a pessoa escreveu. No simulador não há envio externo."""
    if conversa.canal == "simulador":
        return True
    telefone = decrypt_secret(conversa.telefone_cifrado)
    if not telefone:
        return False
    return await enviar(conversa.canal, telefone, [texto])


async def enviar_audio(canal: str, telefone: str, wav: bytes) -> bool:
    """Resposta falada. Só pela Evolution: a API oficial da Meta não aceita WAV."""
    if canal != "evolution":
        return False
    import base64
    r = await evolution_adapter.send_audio(settings.EVOLUTION_INSTANCE_NAME, telefone, base64.b64encode(wav).decode())
    return isinstance(r, dict) and r.get("status") != "error" and not r.get("error")


async def enviar(canal: str, telefone: str, mensagens: List[str]) -> bool:
    """Devolve False se alguma mensagem não saiu (os adaptadores não levantam erro: devolvem status error)."""
    tudo_certo = True
    for texto in mensagens:
        if canal == "meta":
            r = await meta_adapter.send_text_message(telefone, texto)
        else:
            r = await evolution_adapter.send_text_message(settings.EVOLUTION_INSTANCE_NAME, telefone, texto)
        if not isinstance(r, dict) or r.get("status") == "error" or r.get("error"):
            log.warning("Mensagem não enviada pelo canal %s: %s", canal, str(r)[:200])
            tudo_certo = False
    return tudo_certo
