"""
Resposta em áudio: quem fala com o bot por áudio também recebe a resposta falada, além do texto.
Ajuda quem tem dificuldade de leitura. Voz gerada pelo Gemini (TTS) em WAV, que a Evolution converte
em áudio do WhatsApp. Sem chave ou com falha, devolve None e fica só o texto.
"""
import base64
import io
import logging
import re
import wave
from typing import Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)
MAX_CARACTERES = 700
_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️]")


def texto_para_falar(texto: str) -> str:
    """Tira o que não se lê em voz alta (negrito, links, emojis, marcadores) e corta textos longos."""
    t = re.sub(r"https?://\S+", "", texto or "")
    t = _EMOJI.sub("", t).replace("*", "").replace("•", "")
    t = re.sub(r"Como chegar:\s*", "", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{2,}", "\n", t).strip()
    if len(t) > MAX_CARACTERES:
        t = t[:MAX_CARACTERES].rsplit(" ", 1)[0] + "…"
    return t


def _wav(pcm: bytes, taxa: int = 24000) -> bytes:
    saida = io.BytesIO()
    with wave.open(saida, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(pcm)
    return saida.getvalue()


async def falar(texto: str, idioma: Optional[str] = None) -> Optional[bytes]:
    """Áudio WAV da resposta, ou None."""
    falado = texto_para_falar(texto)
    if not settings.RESPONDER_EM_AUDIO or not settings.GEMINI_API_KEY or not falado:
        return None
    lingua = "espanhol" if idioma == "es" else "português do Brasil"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_TTS_MODEL}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": f"Leia em {lingua}, com voz calma, clara e acolhedora:\n{falado}"}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": settings.GEMINI_TTS_VOZ}}}},
    }
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini (voz) respondeu %s: %s", r.status_code, r.text[:300])
            return None
        dados = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
        m = re.search(r"rate=(\d+)", dados.get("mimeType", ""))
        return _wav(base64.b64decode(dados["data"]), int(m.group(1)) if m else 24000)
    except Exception as e:
        log.warning("Falha ao gerar a voz: %s", e)
        return None
