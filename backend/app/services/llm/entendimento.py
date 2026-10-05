"""
Entendimento do relato pela IA generativa (Gemini).

A IA lê a mensagem inteira, como uma pessoa leria, e diz qual necessidade ela expressa, escolhendo
SÓ entre as categorias do sistema. Serviços, documentos e locais continuam vindo do catálogo que o
CRAS edita: a IA entende o pedido, não inventa benefício nem decide direito.

Sem GEMINI_API_KEY, ou se a API falhar, devolve None e o fluxo usa o modelo scikit-learn.
O texto que chega aqui já está anonimizado (sem CPF, telefone ou e-mail).
"""
import json
import logging
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.services.ml.train_evaluator import CATEGORIAS, NAO_IDENTIFICADO

log = logging.getLogger(__name__)

# O que cada categoria cobre, para a IA escolher pelo sentido e não pela palavra
DESCRICAO_CATEGORIAS = {
    "renda_beneficio": "falta de dinheiro para as contas do mês, renda baixa, Bolsa Família, BPC/LOAS, benefício cortado ou bloqueado",
    "cadastro_atualizacao": "fazer, atualizar ou consultar o Cadastro Único (CadÚnico), NIS, mudança na família ou de endereço no cadastro",
    "moradia": "sem casa, despejo, aluguel atrasado, casa em risco ou condenada, enchente, aluguel social, morar na rua",
    "documentacao": "tirar ou refazer RG, CPF, certidão de nascimento ou casamento, documento perdido ou roubado",
    "alimentacao": "fome, falta de comida em casa, cesta básica, não ter o que comer ou dar de comer aos filhos",
    "pessoa_idosa_pcd": "cuidado de pessoa idosa ou com deficiência (inclui autismo e doença que incapacita), acessibilidade, cuidador",
    "trabalho_renda": "procura de emprego, desemprego, cursos e qualificação profissional, querer trabalhar",
    "violencia_protecao": "qualquer violência, agressão, ameaça, abuso, abandono ou risco à vida ou à segurança, contra qualquer pessoa",
}

PROMPT = (
    "Você faz a triagem de mensagens que cidadãos mandam pelo WhatsApp para a assistência social de um município brasileiro. "
    "As mensagens são informais, com gírias e erros de escrita. Leia pelo sentido, como um profissional do CRAS leria.\n\n"
    "Categorias possíveis:\n"
    + "\n".join(f"- {c}: {d}" for c, d in DESCRICAO_CATEGORIAS.items())
    + "\n\nResponda em JSON:\n"
    "- tipo: \"pedido\" se a pessoa conta uma situação ou pede ajuda (mesmo curta, como \"estou com fome\"); "
    "\"cumprimento\" se só cumprimenta ou puxa conversa (\"oi\", \"bom dia\", \"tudo bem?\"); "
    "\"outro\" se não tem relação com assistência social.\n"
    "- categoria: a necessidade principal. Use \"nao_identificado\" se não for pedido ou se não der para saber.\n"
    "- secundarias: outras necessidades que a pessoa também expressou (pode ser vazia).\n"
    "- resumo: completa a frase \"Entendi que ...\", falando com a pessoa, em até 15 palavras, sem ponto final "
    "(ex.: \"você está sem comida em casa e tem filhos pequenos\"). Use só o que a pessoa disse: não acrescente urgência, "
    "detalhes ou sentimentos. Não prometa benefício nem diga que ela tem direito. "
    "Vazio se não for pedido.\n"
    "Na dúvida sobre violência ou risco, escolha violencia_protecao: é melhor encaminhar com prioridade."
)

_TODAS = CATEGORIAS + [NAO_IDENTIFICADO]

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "tipo": {"type": "STRING", "enum": ["pedido", "cumprimento", "outro"]},
        "categoria": {"type": "STRING", "enum": _TODAS},
        "secundarias": {"type": "ARRAY", "items": {"type": "STRING", "enum": CATEGORIAS}},
        "resumo": {"type": "STRING"},
    },
    "required": ["tipo", "categoria", "secundarias", "resumo"],
}


def disponivel() -> bool:
    return bool(settings.GEMINI_API_KEY)


def _validar(dados: Any) -> Optional[Dict[str, Any]]:
    """Confere o que veio da IA: nada fora das categorias do sistema passa."""
    if not isinstance(dados, dict) or dados.get("categoria") not in _TODAS:
        return None
    tipo = dados.get("tipo") if dados.get("tipo") in ("pedido", "cumprimento", "outro") else "pedido"
    categoria = dados["categoria"] if tipo == "pedido" else NAO_IDENTIFICADO
    secundarias = [c for c in dados.get("secundarias") or [] if c in CATEGORIAS and c != categoria]
    resumo = str(dados.get("resumo") or "").strip().rstrip(".")[:160] if categoria != NAO_IDENTIFICADO else ""
    return {"tipo": tipo, "categoria": categoria, "secundarias": list(dict.fromkeys(secundarias)), "resumo": resumo}


async def entender(texto: str) -> Optional[Dict[str, Any]]:
    """Devolve {tipo, categoria, secundarias, resumo} ou None (sem chave ou com falha na API)."""
    if not disponivel() or not texto.strip():
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": texto[:2000]}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": SCHEMA},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini respondeu %s: %s", r.status_code, r.text[:300])
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        return _validar(json.loads("".join(p.get("text", "") for p in partes)))
    except Exception as e:  # rede, JSON quebrado, resposta bloqueada: segue com o modelo local
        log.warning("Falha ao consultar o Gemini: %s", e)
        return None
