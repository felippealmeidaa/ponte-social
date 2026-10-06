"""
Resumo do caso para a ficha: duas frases sobre a conversa inteira, para o técnico entender em segundos.
É só apoio à leitura: o painel avisa que é automático e mostra o relato ao lado. A IA não julga nem decide direito.
Sem GEMINI_API_KEY, não há resumo (devolve None).
"""
import logging
from typing import List, Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

PROMPT = (
    "Você ajuda a equipe de um CRAS (assistência social) a ler casos que chegaram pelo WhatsApp. "
    "Resuma a conversa abaixo em português, em no máximo 2 frases curtas: a situação da pessoa, do que ela precisa "
    "e o que o bot já orientou ou se ela pediu contato. Use só o que está escrito; não invente, não julgue a pessoa, "
    "não diga se ela tem direito a benefício e não use nomes nem números de documento."
)


async def resumir(linhas: List[str]) -> Optional[str]:
    if not settings.GEMINI_API_KEY or not linhas:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    conversa = "\n".join(linhas)[-6000:]
    payload = {
        "system_instruction": {"parts": [{"text": PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": conversa}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 200},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini (resumo) respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        texto = " ".join("".join(p.get("text", "") for p in partes).split()).strip()
        return texto[:600] or None
    except Exception as e:
        log.warning("Falha ao resumir o caso: %s", e)
        return None
