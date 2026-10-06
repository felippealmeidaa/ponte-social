"""
"Não entendi": o bot reescreve a última resposta de um jeito mais simples e detalhado (opção 2 da ajuda).
Não acrescenta informação sobre benefício: só explica com outras palavras o que já foi dito, e mantém as
opções numeradas no fim para a pessoa responder igual. Sem GEMINI_API_KEY, devolve None.
"""
import logging
from typing import Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

PROMPT = (
    "Você é o assistente de orientação da assistência social no WhatsApp. A pessoa disse que não entendeu a mensagem abaixo. "
    "Reescreva a mensagem em português do Brasil, de forma mais simples e um pouco mais detalhada: frases curtas, palavras do dia a dia, "
    "e explique em poucas palavras os termos difíceis (por exemplo: CRAS é o posto da assistência social do bairro; Cadastro Único é o "
    "cadastro do governo para programas sociais; NIS é o número desse cadastro). "
    "Use só o que está na mensagem: não acrescente benefício, valor, prazo ou endereço, e não diga que a pessoa tem direito a nada. "
    "Se a mensagem tiver opções numeradas (*1*, *2*...), repita as mesmas opções no fim, com os mesmos números. "
    "Mantenha links e números de telefone. Responda só com a mensagem reescrita."
)


async def explicar(mensagem: str) -> Optional[str]:
    if not settings.GEMINI_API_KEY or not (mensagem or "").strip():
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": mensagem[:4000]}]}],
        "generationConfig": {"temperature": 0.2},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini (explicar) respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        texto = "".join(p.get("text", "") for p in partes).strip()
        return texto[:3000] or None
    except Exception as e:
        log.warning("Falha ao explicar a mensagem: %s", e)
        return None
