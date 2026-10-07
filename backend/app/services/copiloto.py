"""
Copiloto construtor (Configurações › Fluxos e Agentes, botão "Criar com IA"): a coordenação descreve em texto o que
quer e o Gemini devolve um fluxo ou um agente no formato do sistema. NADA é salvo aqui: a proposta volta para a tela,
que mostra a prévia, e só vira fluxo/agente quando a pessoa confirma (pelas rotas normais, com a validação normal).

O fluxo proposto passa pela mesma validação do editor; com problema, o Gemini recebe a lista e tenta corrigir uma vez.
Violência não é montada no fluxo: o sistema já para qualquer fluxo com a mensagem de emergência.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional, Set

import httpx

from app.core.config import settings
from app.services.agentes.ferramentas import FERRAMENTAS
from app.services.fluxos import motor
from app.services.ml.train_evaluator import CATEGORIAS

log = logging.getLogger(__name__)

REGRAS_TEXTO = (
    "Os textos falam com cidadãos que procuram a assistência social (CRAS) de Anápolis-GO pelo WhatsApp: linguagem simples, "
    "frases curtas, português do Brasil com acentuação correta. Nunca prometa benefício nem diga que a pessoa tem direito: quem decide é a equipe do CRAS. "
    "Não peça CPF, NIS nem endereço completo."
)

PROMPT_FLUXO = (
    "Você monta fluxos de conversa para um sistema de assistência social. Um fluxo é uma lista de etapas ligadas, sem voltar para trás.\n"
    "Tipos de etapa e campos:\n"
    "- inicio: só uma, a primeira. Saída: proximo.\n"
    "- mensagem: texto. Saída: proximo.\n"
    "- pergunta: texto (a pergunta), opcoes (2 a 6 opções curtas), variavel (nome para guardar a resposta, minúsculas e _). "
    "Saídas: opcao:1, opcao:2, ... (uma por opção, na ordem) e outra (resposta fora das opções).\n"
    "- condicao: variavel (uma resposta guardada antes), operador (igual | contem | vazio), valor. Saídas: sim, nao.\n"
    "- agente: agente_id (um dos agentes listados), entrada (texto que o agente recebe; use {{mensagem}} para a última mensagem). Saída: proximo.\n"
    "- ferramenta: ferramenta (uma das listadas), argumentos (necessidade, bairro ou pergunta conforme a ferramenta; pode usar "
    "{{variavel}}), variavel (onde guardar o resultado). Saída: proximo.\n"
    "- fila: texto opcional de despedida, necessidade opcional. Encerra: no WhatsApp, o caso entraria na fila do CRAS.\n"
    "- fim: texto opcional. Encerra.\n"
    "Regras: toda saída de toda etapa precisa de uma ligação {de, saida, para}; nenhuma ligação volta para uma etapa anterior "
    "nem para o início; toda etapa precisa ser alcançável a partir do início; ids curtos em minúsculas (ex.: boas_vindas); "
    "no máximo 20 etapas; dê um titulo curto a cada etapa. Use {{nome_da_variavel}} nos textos para repetir uma resposta guardada.\n"
    "O caminho de \"outra\" (resposta fora das opções) segue para uma etapa NOVA, nunca de volta para a mesma pergunta "
    "(ex.: uma mensagem \"Não entendi, vou pedir para a equipe do CRAS falar com você\" seguida de fila).\n"
    "NÃO crie etapas para violência, ameaça ou risco: o sistema já interrompe qualquer fluxo e envia a mensagem de emergência.\n"
    + REGRAS_TEXTO + "\n\n"
    "Responda SÓ com um JSON neste formato (exemplo pequeno):\n"
    '{"nome": "Bairro e CRAS", "descricao": "Pergunta o bairro e indica o CRAS", "etapas": ['
    '{"id": "inicio", "tipo": "inicio", "titulo": "Início"}, '
    '{"id": "bairro", "tipo": "pergunta", "titulo": "Bairro", "texto": "Em que bairro você mora?", "opcoes": ["Centro", "Outro bairro"], "variavel": "bairro"}, '
    '{"id": "cras", "tipo": "ferramenta", "titulo": "Procura o CRAS", "ferramenta": "cras_do_bairro", "argumentos": {"bairro": "{{bairro}}"}, "variavel": "cras"}, '
    '{"id": "fim", "tipo": "fim", "titulo": "Fim", "texto": "Procure o CRAS indicado."}], '
    '"ligacoes": [{"de": "inicio", "saida": "proximo", "para": "bairro"}, {"de": "bairro", "saida": "opcao:1", "para": "cras"}, '
    '{"de": "bairro", "saida": "opcao:2", "para": "cras"}, {"de": "bairro", "saida": "outra", "para": "cras"}, '
    '{"de": "cras", "saida": "proximo", "para": "fim"}]}'
)

PROMPT_AGENTE = (
    "Você configura agentes de IA para a assistência social. Devolva nome (curto), descricao (uma frase para a equipe), "
    "instrucoes (o que o agente faz e como responde, em segunda pessoa: \"Você ...\"), temperatura (0 a 1; use 0.2 para "
    "orientação) e ferramentas (só as necessárias, entre as listadas). As instruções não podem contrariar estas regras: "
    + REGRAS_TEXTO
)

SCHEMA_AGENTE = {
    "type": "OBJECT",
    "properties": {
        "nome": {"type": "STRING"}, "descricao": {"type": "STRING"}, "instrucoes": {"type": "STRING"},
        "temperatura": {"type": "NUMBER"}, "ferramentas": {"type": "ARRAY", "items": {"type": "STRING", "enum": sorted(FERRAMENTAS)}},
    },
    "required": ["nome", "instrucoes", "ferramentas"],
}


class CopilotoIndisponivel(RuntimeError):
    pass


async def _gemini(prompt: str, texto: str, schema: Optional[dict]) -> Any:
    """Com schema, o Gemini segue o formato à força (bom para objetos simples, como o agente). No fluxo, o formato vai
    no texto do pedido: com o schema grande e aninhado o modelo leve errava mais (opções vazias, ligações trocadas)."""
    if not settings.GEMINI_API_KEY:
        raise CopilotoIndisponivel("O copiloto precisa da chave do Gemini (GEMINI_API_KEY).")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": texto}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json", **({"responseSchema": schema} if schema else {})},
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            try:
                r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
            except httpx.TimeoutException:  # instabilidade do Gemini: tenta mais uma vez
                r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        if r.status_code != 200:
            log.warning("Gemini respondeu %s: %s", r.status_code, r.text[:300])
            raise CopilotoIndisponivel("O Gemini não respondeu agora. Tente de novo em instantes." if r.status_code in (429, 503)
                                       else f"O Gemini recusou o pedido (código {r.status_code}).")
        partes = r.json()["candidates"][0]["content"]["parts"]
        return json.loads("".join(p.get("text", "") for p in partes))
    except CopilotoIndisponivel:
        raise
    except Exception as e:
        log.warning("Falha no copiloto: %s", e)
        raise CopilotoIndisponivel("Não consegui montar a proposta agora. Tente de novo ou descreva de outro jeito.")


def _limpar_fluxo(dados: Any) -> Dict[str, Any]:
    """Tira campos vazios e o que não pertence ao tipo; deixa ids em minúsculas sem espaço."""
    if not isinstance(dados, dict):
        return {"nome": "Fluxo do copiloto", "descricao": "", "etapas": [], "ligacoes": []}

    def ident(x: Any) -> str:
        return re.sub(r"[^a-z0-9_]", "_", str(x or "").strip().lower())[:30]

    etapas = []
    for e in dados.get("etapas") or []:
        if not isinstance(e, dict):
            continue
        limpa = {k: v for k, v in e.items() if v not in (None, "", [], {})}
        limpa["id"] = ident(limpa.get("id"))
        if isinstance(limpa.get("argumentos"), dict):
            limpa["argumentos"] = {k: str(v) for k, v in limpa["argumentos"].items() if v}
        etapas.append(limpa)
    ligacoes = [{"de": ident(l.get("de")), "saida": str(l.get("saida") or ""), "para": ident(l.get("para"))}
                for l in dados.get("ligacoes") or [] if isinstance(l, dict)]
    return {"nome": str(dados.get("nome") or "Fluxo do copiloto")[:80], "descricao": str(dados.get("descricao") or "")[:300],
            "etapas": etapas[:motor.MAX_ETAPAS], "ligacoes": ligacoes}


def _contexto(agentes: List[Dict[str, str]]) -> str:
    ferramentas = "\n".join(f"- {k}: {v['declaracao']['description']}" for k, v in FERRAMENTAS.items())
    lista_agentes = "\n".join(f"- {a['id']}: {a['nome']}" for a in agentes) or "- (nenhum agente cadastrado: não use etapa de agente)"
    return (f"Ferramentas disponíveis:\n{ferramentas}\n\nAgentes cadastrados (agente_id: nome):\n{lista_agentes}\n\n"
            f"Necessidades possíveis (para argumentos e fila): {', '.join(CATEGORIAS)}\n")


async def propor_fluxo(pedido: str, agentes: List[Dict[str, str]], atual: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Proposta de fluxo (nova ou ajuste do atual) já validada; 'problemas' fica vazio quando está pronta para testar."""
    ids: Set[str] = {a["id"] for a in agentes}
    base = _contexto(agentes)
    if atual:
        base += ("\nFluxo atual (mude só o que o pedido pede e devolva o fluxo COMPLETO):\n"
                 + json.dumps({k: atual[k] for k in ("nome", "descricao", "etapas", "ligacoes")}, ensure_ascii=False))
    texto = f"{base}\nPedido da coordenação: {pedido.strip()[:1500]}"
    proposta = _limpar_fluxo(await _gemini(PROMPT_FLUXO, texto, None))
    problemas = motor.validar(proposta["etapas"], proposta["ligacoes"], ids)
    tentativas = 1
    if problemas:  # uma rodada de correção com a lista de problemas
        tentativas = 2
        correcao = (f"{texto}\n\nSua proposta anterior:\n{json.dumps(proposta, ensure_ascii=False)}\n\n"
                    f"Ela tem estes problemas; corrija e devolva o fluxo completo:\n- " + "\n- ".join(problemas))
        proposta = _limpar_fluxo(await _gemini(PROMPT_FLUXO, correcao, None))
        problemas = motor.validar(proposta["etapas"], proposta["ligacoes"], ids)
    return {"proposta": proposta, "problemas": problemas, "tentativas": tentativas}


async def propor_agente(pedido: str) -> Dict[str, Any]:
    ferramentas = "\n".join(f"- {k}: {v['descricao']}" for k, v in FERRAMENTAS.items())
    dados = await _gemini(PROMPT_AGENTE, f"Ferramentas disponíveis:\n{ferramentas}\n\nPedido da coordenação: {pedido.strip()[:1500]}", SCHEMA_AGENTE)
    if not isinstance(dados, dict):
        raise CopilotoIndisponivel("A proposta veio num formato inesperado. Tente de novo.")
    try:
        temperatura = max(0.0, min(1.0, float(dados.get("temperatura", 0.2))))
    except (TypeError, ValueError):
        temperatura = 0.2
    return {"proposta": {
        "nome": str(dados.get("nome") or "Agente do copiloto")[:80], "descricao": str(dados.get("descricao") or "")[:300],
        "instrucoes": str(dados.get("instrucoes") or "")[:6000], "temperatura": round(temperatura, 1),
        "ferramentas": [f for f in dict.fromkeys(dados.get("ferramentas") or []) if f in FERRAMENTAS], "ativo": True,
    }}
