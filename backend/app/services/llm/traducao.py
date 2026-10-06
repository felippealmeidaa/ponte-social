"""
Atendimento em espanhol (muitos migrantes venezuelanos procuram o CRAS).

Com quem escreve em espanhol, o que a pessoa escreve é traduzido para o português antes de o bot ler (as regras
de segurança, como a de violência, são em português) e as respostas do bot saem traduzidas para o espanhol.
A equipe sempre lê em português: cada mensagem guarda a tradução.

Sem GEMINI_API_KEY (ou com a API fora do ar), não há tradução: o texto segue como está.
"""
import json
import logging
import re
from typing import Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.services.ml.text_rules import normalizar

log = logging.getLogger(__name__)

NOMES = {"es": "espanhol (como se fala na América Latina)", "pt": "português do Brasil"}
_cache: Dict[Tuple[str, str], str] = {}

# Palavras que só existem em espanhol: uma forte basta para trocar o idioma da conversa
_FORTES = {
    "hola", "buenos", "buenas", "necesito", "necesitamos", "tengo", "tenemos", "quiero", "quisiera", "gracias",
    "ayuda", "ayudame", "ayudar", "dinero", "hijos", "hijo", "hija", "trabajo", "vivienda", "usted", "puedo",
    "nino", "ninos", "senor", "senora", "tambien", "espanol", "venezolano", "venezolana",
    "alquiler", "arriendo", "cuanto", "hambre", "ahorita", "quiere", "llamar", "porfavor",
}
# Também aparecem (ou quase) em português: só contam se vierem duas ou mais
_FRACAS = {"comida", "mi", "mis", "donde", "muy", "pero", "yo", "hay", "ahora", "estoy", "casa", "no"}
_SINAIS = re.compile(r"[¿¡ñ]")


def parece_espanhol(texto: str) -> bool:
    if not texto or len(texto.strip()) < 2:
        return False
    if _SINAIS.search(texto):
        return True
    palavras = set(normalizar(texto).split())
    return bool(palavras & _FORTES) or len(palavras & _FRACAS) >= 3


def precisa_traduzir(texto: str) -> bool:
    """Números de menu, CEP, coordenadas e afins não precisam de tradução."""
    t = (texto or "").strip()
    return bool(t) and not re.fullmatch(r"[\d\s.,;:\-+/()]*", t)


async def traduzir(textos: List[str], para: str) -> List[str]:
    """Traduz em lote (uma chamada só). Se falhar, devolve os textos como vieram."""
    if para not in NOMES or not textos:
        return list(textos)
    faltando = [t for t in dict.fromkeys(textos) if precisa_traduzir(t) and (t, para) not in _cache]
    if faltando and settings.GEMINI_API_KEY:
        prontos = await _chamar(faltando, para)
        if prontos:
            for original, traduzido in zip(faltando, prontos):
                _cache[(original, para)] = traduzido
    return [_cache.get((t, para), t) if precisa_traduzir(t) else t for t in textos]


async def _chamar(textos: List[str], para: str) -> Optional[List[str]]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    instrucao = (
        f"Traduza cada item da lista para {NOMES[para]}, de forma simples e acolhedora, como numa conversa de WhatsApp "
        "da assistência social. Mantenha exatamente: *asteriscos* de negrito, números de opção (*1*, *2*), emojis, links, "
        "números de telefone (190, 180, 100, 121), siglas (CRAS, CREAS, CPF, RG, NIS, BPC) e nomes de lugares. "
        "Não resuma, não acrescente nada e não responda à mensagem: só traduza. Se o item já estiver no idioma pedido, repita igual."
    )
    payload = {
        "system_instruction": {"parts": [{"text": instrucao}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(textos, ensure_ascii=False)}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                             "responseSchema": {"type": "ARRAY", "items": {"type": "STRING"}}},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini (tradução) respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        saida = json.loads("".join(p.get("text", "") for p in partes))
        if not isinstance(saida, list) or len(saida) != len(textos) or not all(isinstance(x, str) and x.strip() for x in saida):
            return None
        return saida
    except Exception as e:
        log.warning("Falha ao traduzir: %s", e)
        return None
