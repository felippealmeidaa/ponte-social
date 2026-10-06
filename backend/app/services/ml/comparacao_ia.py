"""
LLM x modelo local no MESMO conjunto de teste (data/relatos_teste_informais.json, nunca usado no treino).

Compara três abordagens com as mesmas métricas do relatório do modelo (F1 macro com IC95 por bootstrap,
acurácia, revocação de violência) e mede tempo e tokens:
- Modelo local: o sistema em uso sem IA (regra de violência + Regressão Logística + palavras-chave).
- LLM (Gemini) sozinho: só a leitura do relato pela IA, escolhendo entre as categorias do sistema.
- Sistema híbrido (o que roda no WhatsApp): a IA lê, mas se a regra ou o modelo local virem violência, vale violência.
Também testa se a diferença entre o modelo local e o LLM é estatisticamente significativa (McNemar).

Rodar: python -m app.services.ml.comparacao_ia   (precisa de GEMINI_API_KEY; faz uma chamada por relato)
"""
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import numpy as np

from app.core.config import settings
from app.services.llm import entendimento
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.train_evaluator import (BASE_DIR, NAO_IDENTIFICADO, VIOLENCIA, bootstrap_f1, carregar_teste, mcnemar,
                                             metricas)

SAIDA = os.path.join(BASE_DIR, "comparacao_llm_ml.json")
# Plano gratuito do Gemini: 15 pedidos por minuto. Uma chamada de cada vez, com folga, e nova tentativa no 429.
INTERVALO_S = 4.3
TENTATIVAS = 4
_estado: Dict[str, Any] = {"rodando": False, "feitos": 0, "total": 0}


async def _gemini(client: httpx.AsyncClient, texto: str) -> Dict[str, Any]:
    """Mesmo pedido que o bot faz (entendimento.PROMPT e SCHEMA), guardando tempo e tokens."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": entendimento.PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": texto[:2000]}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": entendimento.SCHEMA},
    }
    for tentativa in range(TENTATIVAS):
        inicio = time.perf_counter()
        try:
            r = await client.post(url, json=payload, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
        except Exception as e:
            return {"categoria": None, "segundos": time.perf_counter() - inicio, "erro": str(e)[:120]}
        segundos = time.perf_counter() - inicio
        if r.status_code in (429, 503) and tentativa < TENTATIVAS - 1:
            await asyncio.sleep(_espera(r) + 1)  # limite por minuto: espera o tempo que a API pede e tenta de novo
            continue
        break
    try:
        if r.status_code != 200:
            return {"categoria": None, "segundos": segundos, "erro": f"HTTP {r.status_code}"}
        corpo = r.json()
        partes = corpo["candidates"][0]["content"]["parts"]
        lido = entendimento._validar(json.loads("".join(p.get("text", "") for p in partes)))
        uso = corpo.get("usageMetadata", {})
        return {"categoria": lido["categoria"] if lido else None, "segundos": segundos,
                "tokens": int(uso.get("promptTokenCount", 0)) + int(uso.get("candidatesTokenCount", 0))}
    except Exception as e:
        return {"categoria": None, "segundos": time.perf_counter() - inicio, "erro": str(e)[:120]}


def _espera(r) -> float:
    try:
        for d in r.json()["error"].get("details", []):
            if "retryDelay" in d:
                return float(str(d["retryDelay"]).rstrip("s"))
    except Exception:
        pass
    return 10.0


def _bloco(y, pred) -> dict:
    m = metricas(y, pred)
    m["f1_macro_ic95"] = bootstrap_f1(y, pred)
    m["taxa_nao_identificado"] = float(np.mean(np.asarray(pred) == NAO_IDENTIFICADO))
    return m


async def comparar(progresso: Optional[Dict[str, Any]] = None) -> dict:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("Sem GEMINI_API_KEY: não dá para avaliar o LLM.")
    teste = carregar_teste()
    textos, y = list(teste["texto"]), list(teste["categoria"])
    progresso = progresso if progresso is not None else {}
    progresso.update({"feitos": 0, "total": len(textos)})

    # Modelo local (o sistema sem IA), com tempo por relato
    pred_ml, tempos_ml = [], []
    for t in textos:
        inicio = time.perf_counter()
        pred_ml.append(SocialClassifierService.classify_relato(t)["categoria"])
        tempos_ml.append(time.perf_counter() - inicio)

    # LLM: uma chamada de cada vez, no ritmo que o plano gratuito aceita
    respostas = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i, t in enumerate(textos):
            if i:
                await asyncio.sleep(INTERVALO_S)
            respostas.append(await _gemini(client, t))
            progresso["feitos"] += 1

    falhas = sum(1 for r in respostas if r["categoria"] is None)
    pred_llm = [r["categoria"] or NAO_IDENTIFICADO for r in respostas]
    # Híbrido = o que o bot faz: violência vista pela regra/modelo local vale; senão, a IA; sem IA, o modelo local
    pred_hib = [VIOLENCIA if m == VIOLENCIA else (r["categoria"] or m) for m, r in zip(pred_ml, respostas)]

    tempos_llm = [r["segundos"] for r in respostas]
    tokens = [r.get("tokens", 0) for r in respostas]
    relatorio = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "conjunto": f"{len(textos)} relatos informais simulados, os mesmos do relatório do modelo (nunca usados no treino)",
        "modelo_llm": settings.GEMINI_MODEL,
        "abordagens": {
            "modelo_local": {**_bloco(y, pred_ml), "tempo_medio_ms": round(1000 * float(np.mean(tempos_ml)), 1),
                             "descricao": "Regra de violência + Regressão Logística + palavras-chave (sem internet, sem custo)"},
            "llm": {**_bloco(y, pred_llm), "tempo_medio_ms": round(1000 * float(np.mean(tempos_llm)), 1),
                    "tempo_p95_ms": round(1000 * float(np.percentile(tempos_llm, 95)), 1),
                    "tokens_medios": round(float(np.mean(tokens)), 1), "falhas": falhas,
                    "descricao": f"Gemini ({settings.GEMINI_MODEL}) sozinho, escolhendo entre as categorias do sistema"},
            "hibrido": {**_bloco(y, pred_hib),
                        "descricao": "O que roda no WhatsApp: a IA lê, mas violência vista pela regra ou pelo modelo local sempre vale"},
        },
        "mcnemar_local_x_llm": {"modelo_a": "modelo_local", "modelo_b": "llm", **mcnemar(y, pred_ml, pred_llm)},
        "casos": [{"texto": t, "esperado": e, "modelo_local": m, "llm": l, "hibrido": h}
                  for t, e, m, l, h in zip(textos, y, pred_ml, pred_llm, pred_hib)],
    }
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(relatorio, f, indent=2, ensure_ascii=False)
    return relatorio


async def comparar_em_fundo() -> None:
    _estado.update({"rodando": True, "erro": None})
    try:
        await comparar(_estado)
    except Exception as e:
        _estado["erro"] = str(e)[:200]
    finally:
        _estado["rodando"] = False


def estado() -> dict:
    return {k: _estado.get(k) for k in ("rodando", "feitos", "total", "erro")}


def ler() -> Optional[dict]:
    try:
        with open(SAIDA, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


if __name__ == "__main__":
    r = asyncio.run(comparar())
    for nome, a in r["abordagens"].items():
        print(f"{nome:13s} F1={a['f1_macro']:.3f} IC95={a['f1_macro_ic95'][0]:.3f}-{a['f1_macro_ic95'][1]:.3f} "
              f"acerto={a['acuracia']:.0%} violência={a['recall_violencia']:.0%}")
    print("McNemar local x LLM:", r["mcnemar_local_x_llm"])
