"""
Roda uma mensagem num agente (só no teste do painel): Gemini com chamada de ferramentas, no máximo MAX_PASSOS
chamadas por mensagem. Devolve a resposta e cada passo (ferramenta, argumentos, resultado) para a tela mostrar.

Antes de tudo, a mesma trava do bot: com sinal de violência, o agente não roda e sai a mensagem de emergência fixa
(190/180/100) do catálogo. A mensagem da pessoa é anonimizada antes de ir para a IA.
"""
import logging
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AgentePersonalizado
from app.services import catalogo
from app.services.agentes.ferramentas import FERRAMENTAS, declaracoes
from app.services.anonimizacao import anonimizar_texto
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.text_rules import detectar_violencia
from app.services.ml.train_evaluator import VIOLENCIA

log = logging.getLogger(__name__)

MAX_PASSOS = 5
MAX_HISTORICO = 12

# Regras que valem para todo agente, antes das instruções escritas pela coordenação
REGRAS_FIXAS = (
    "Você atende pela assistência social (CRAS) de Anápolis-GO. Regras que não podem ser mudadas:\n"
    "- Você orienta; nunca diz que a pessoa tem ou não tem direito a um benefício. Quem decide é a equipe do CRAS.\n"
    "- Use as ferramentas para requisitos, valores, documentos, endereços e horários. Se elas não trouxerem a "
    "informação, diga que não sabe e indique procurar o CRAS. Não invente.\n"
    "- Não peça nem repita CPF, NIS, telefone ou endereço completo.\n"
    "- Linguagem simples, frases curtas, em português do Brasil.\n\n"
    "Instruções desta função, escritas pela coordenação:\n"
)


class AgenteIndisponivel(RuntimeError):
    pass


async def _violencia(texto: str) -> bool:
    if detectar_violencia(texto):
        return True
    return (await SocialClassifierService.classificar(texto)).get("categoria") == VIOLENCIA


async def _gemini(payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
    except Exception as e:
        raise AgenteIndisponivel(f"Sem conexão com o Gemini ({e.__class__.__name__}).")
    if r.status_code != 200:
        log.warning("Gemini respondeu %s: %s", r.status_code, r.text[:300])
        raise AgenteIndisponivel("O Gemini não respondeu agora. Tente de novo em instantes." if r.status_code in (429, 503)
                                 else f"O Gemini recusou o pedido (código {r.status_code}).")
    return r.json()


async def responder(session: AsyncSession, agente: AgentePersonalizado, historico: List[Dict[str, str]], mensagem: str) -> Dict[str, Any]:
    texto = anonimizar_texto(mensagem.strip())[:2000]
    if await _violencia(texto):
        return {"resposta": catalogo.texto("emergencia"), "passos": [], "violencia": True, "mensagem_enviada": texto}
    if not settings.GEMINI_API_KEY:
        raise AgenteIndisponivel("Os agentes precisam da chave do Gemini (GEMINI_API_KEY).")

    permitidas = [f for f in agente.ferramentas or [] if f in FERRAMENTAS]
    conteudos: List[Dict[str, Any]] = []
    for m in historico[-MAX_HISTORICO:]:
        conteudos.append({"role": "user" if m.get("autor") == "pessoa" else "model",
                          "parts": [{"text": anonimizar_texto(str(m.get("texto", "")))[:2000]}]})
    conteudos.append({"role": "user", "parts": [{"text": texto}]})

    payload: Dict[str, Any] = {
        "system_instruction": {"parts": [{"text": REGRAS_FIXAS + agente.instrucoes}]},
        "contents": conteudos,
        "generationConfig": {"temperature": max(0.0, min(1.0, agente.temperatura))},
    }
    if permitidas:
        payload["tools"] = [{"functionDeclarations": declaracoes(permitidas)}]

    passos: List[Dict[str, Any]] = []
    for _ in range(MAX_PASSOS + 1):
        dados = await _gemini(payload)
        try:
            conteudo = dados["candidates"][0]["content"]
        except (KeyError, IndexError):
            raise AgenteIndisponivel("O Gemini não devolveu resposta (pode ter bloqueado o conteúdo).")
        partes = conteudo.get("parts") or []
        chamadas = [p["functionCall"] for p in partes if "functionCall" in p]
        if not chamadas:
            resposta = "".join(p.get("text", "") for p in partes).strip()
            return {"resposta": resposta or "(o agente não respondeu nada)", "passos": passos, "violencia": False, "mensagem_enviada": texto}
        if len(passos) >= MAX_PASSOS:
            return {"resposta": "Precisei consultar coisas demais para responder. Procure o CRAS do seu bairro para orientação.",
                    "passos": passos, "violencia": False, "mensagem_enviada": texto, "limite": True}
        # Devolve ao Gemini a parte exatamente como veio (inclui assinaturas de raciocínio, quando houver)
        conteudos.append({"role": "model", "parts": partes})
        respostas = []
        for chamada in chamadas:
            nome, args = chamada.get("name", ""), chamada.get("args") or {}
            if nome not in permitidas:  # a IA tentou uma ferramenta que este agente não tem
                resultado: Dict[str, Any] = {"erro": "ferramenta não permitida para este agente"}
            else:
                try:
                    resultado = await FERRAMENTAS[nome]["executar"](session, args)
                except Exception as e:
                    log.warning("Ferramenta %s falhou: %s", nome, e)
                    resultado = {"erro": "a consulta falhou"}
            passos.append({"ferramenta": nome, "argumentos": args, "resultado": resultado, "permitida": nome in permitidas})
            respostas.append({"functionResponse": {"name": nome, "response": resultado}})
        conteudos.append({"role": "user", "parts": respostas})
    raise AgenteIndisponivel("O agente não terminou a resposta.")


def validar(nome: str, instrucoes: str, temperatura: float, ferramentas: List[str]) -> Optional[str]:
    if not nome.strip():
        return "Dê um nome ao agente."
    if len(instrucoes.strip()) < 20:
        return "Escreva as instruções do agente (pelo menos uma frase completa)."
    if not 0 <= temperatura <= 1:
        return "A criatividade vai de 0 a 1."
    desconhecidas = [f for f in ferramentas if f not in FERRAMENTAS]
    if desconhecidas:
        return f"Ferramenta desconhecida: {', '.join(desconhecidas)}."
    return None

