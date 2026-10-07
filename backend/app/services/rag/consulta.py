"""
Busca em três etapas na base de conhecimento (resto da Fase 2 do plano):

1. Reescrita: a mensagem informal ("perdi tudo na chuva, tem ajuda?") vira uma consulta nos termos que um documento
   oficial usaria. A IA NÃO pode acrescentar programa, benefício ou requisito que a pessoa não mencionou: quem lê a
   reescrita é a equipe, que confere na tela.
2. Recuperação: os 10 trechos mais próximos, buscando com a pergunta original e com a reescrita (vale a maior nota).
3. Reordenação: a IA lê os 10 candidatos e dá uma nota de 0 a 10 de quanto cada um responde à pergunta.

Cada etapa com IA é opcional e cai para a anterior sem chave ou com falha; a resposta diz o que rodou.
"""
import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

PROMPT_REESCRITA = (
    "Você ajuda a buscar trechos em leis, decretos e manuais da assistência social de um município brasileiro. "
    "Recebe a mensagem de um cidadão, informal, com gírias e erros, e reescreve como uma consulta de busca nos termos "
    "que um documento oficial usaria (ex.: \"to sem onde morar\" → \"perda da moradia, situação de rua, abrigo\").\n"
    "Regras: use só o que a pessoa disse. Cada termo tem de sair das palavras dela ou ser sinônimo direto delas. "
    "NÃO acrescente nome de programa, benefício ou categoria de benefício (ex.: \"benefício eventual\", \"BPC\", "
    "\"aluguel social\") que ela não citou, nem valor, requisito, causa provável ou providência (ex.: \"atualização "
    "cadastral\"), nem dê como certo que ela tem direito a algo. Se a mensagem citar um programa (ou a sigla dele), "
    "mantenha o nome que ela usou.\n"
    "Responda em JSON: consulta (uma frase curta, até 25 palavras) e termos (de 2 a 6 palavras-chave)."
)
SCHEMA_REESCRITA = {
    "type": "OBJECT",
    "properties": {"consulta": {"type": "STRING"}, "termos": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["consulta", "termos"],
}

PROMPT_REORDENACAO = (
    "Você avalia trechos de documentos oficiais da assistência social. Para a pergunta de um cidadão, dê a cada trecho "
    "uma nota de 0 a 10 de quanto ele RESPONDE à pergunta (10: responde diretamente; 5: é do assunto mas não responde; "
    "0: não tem relação). Julgue só pelo texto do trecho. Responda em JSON: notas, uma lista com {id, nota}."
)
SCHEMA_REORDENACAO = {
    "type": "OBJECT",
    "properties": {"notas": {"type": "ARRAY", "items": {
        "type": "OBJECT", "properties": {"id": {"type": "STRING"}, "nota": {"type": "NUMBER"}}, "required": ["id", "nota"]}}},
    "required": ["notas"],
}


async def _gemini_json(prompt: str, texto: str, schema: dict, timeout: float = 15.0) -> Optional[Any]:
    if not settings.GEMINI_API_KEY:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": texto}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": schema},
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        return json.loads("".join(p.get("text", "") for p in partes))
    except Exception as e:
        log.warning("Falha ao consultar o Gemini: %s", e)
        return None


async def reescrever(pergunta: str) -> Optional[Dict[str, Any]]:
    """{consulta, termos} ou None. A consulta reescrita é mostrada à equipe junto com a original."""
    dados = await _gemini_json(PROMPT_REESCRITA, pergunta[:1000], SCHEMA_REESCRITA)
    if not isinstance(dados, dict) or not str(dados.get("consulta") or "").strip():
        return None
    termos = [str(t).strip() for t in dados.get("termos") or [] if str(t).strip()][:6]
    return {"consulta": str(dados["consulta"]).strip()[:300], "termos": termos}


async def reordenar(pergunta: str, candidatos: List[Dict[str, str]]) -> Optional[Dict[str, float]]:
    """{id: nota de 0 a 1} para os candidatos [{id, texto}], ou None. Ids que a IA não devolver ficam de fora do dicionário."""
    if not candidatos:
        return {}
    blocos = "\n\n".join(f"[id={c['id']}]\n{c['texto'][:1500]}" for c in candidatos)
    dados = await _gemini_json(PROMPT_REORDENACAO, f"Pergunta: {pergunta[:500]}\n\nTrechos:\n\n{blocos}", SCHEMA_REORDENACAO, timeout=25.0)
    if not isinstance(dados, dict):
        return None
    validos = {c["id"] for c in candidatos}
    notas: Dict[str, float] = {}
    for item in dados.get("notas") or []:
        try:
            if item["id"] in validos:
                notas[item["id"]] = max(0.0, min(10.0, float(item["nota"]))) / 10
        except (KeyError, TypeError, ValueError):
            continue
    return notas or None
