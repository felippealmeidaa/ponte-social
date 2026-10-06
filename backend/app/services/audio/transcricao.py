"""
Transcrição de áudio do WhatsApp para o bot entender quem prefere falar a escrever.

Com GEMINI_API_KEY, o áudio vai para o Gemini, que só transcreve (não resume nem interpreta). Sem a chave,
tenta o Faster-Whisper local, se estiver instalado. Se nada funcionar, devolve None e o bot pede para a
pessoa escrever. Nunca inventa texto: um áudio que não deu para entender não vira relato.
"""
import asyncio
import base64
import logging
import os
import tempfile
from typing import Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

MAX_BYTES = 15 * 1024 * 1024
INAUDIVEL = "[inaudível]"
PROMPT = (
    "Transcreva exatamente o que a pessoa fala neste áudio de WhatsApp, no idioma em que ela fala "
    "(português ou espanhol, sem traduzir), como texto corrido. "
    "Não resuma, não corrija o sentido, não responda à pessoa e não acrescente nada. "
    f"Se não houver fala compreensível, responda apenas {INAUDIVEL}"
)


def _limpar(texto: str) -> Optional[str]:
    texto = " ".join((texto or "").split()).strip().strip('"“”')
    if not texto or INAUDIVEL in texto.lower():
        return None
    return texto[:2000]


async def _gemini(audio: bytes, mime: str) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [
            {"inline_data": {"mime_type": mime, "data": base64.b64encode(audio).decode()}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {"temperature": 0},
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini (áudio) respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        return _limpar("".join(p.get("text", "") for p in partes))
    except Exception as e:
        log.warning("Falha ao transcrever com o Gemini: %s", e)
        return None


def _whisper_local(audio: bytes, sufixo: str) -> Optional[str]:
    try:
        from faster_whisper import WhisperModel  # opcional: não está nas dependências
    except Exception:
        return None
    caminho = None
    try:
        with tempfile.NamedTemporaryFile(suffix=sufixo, delete=False) as f:
            f.write(audio)
            caminho = f.name
        modelo = WhisperModel("tiny", device="cpu", compute_type="int8")
        segmentos, _ = modelo.transcribe(caminho, language="pt")
        return _limpar(" ".join(s.text for s in segmentos))
    except Exception as e:
        log.warning("Falha ao transcrever com o Whisper local: %s", e)
        return None
    finally:
        if caminho and os.path.exists(caminho):
            os.remove(caminho)


async def transcrever(audio: Optional[bytes], mime: str = "audio/ogg") -> Optional[str]:
    """Texto do áudio, ou None se não deu (sem áudio, grande demais, desligado, sem fala ou sem serviço)."""
    if not settings.TRANSCREVER_AUDIO or not audio or len(audio) > MAX_BYTES:
        return None
    mime = (mime or "audio/ogg").split(";")[0].strip() or "audio/ogg"
    if settings.GEMINI_API_KEY:
        return await _gemini(audio, mime)
    sufixo = "." + mime.split("/")[-1].replace("mpeg", "mp3")
    return await asyncio.to_thread(_whisper_local, audio, sufixo)
