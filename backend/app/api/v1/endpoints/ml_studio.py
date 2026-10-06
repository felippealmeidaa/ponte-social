"""Aba "Modelo de IA": relatório do modelo local, comparação com o LLM e retreino com os casos reais.
Ler: qualquer pessoa da equipe. Rodar comparação ou retreino: só a coordenação."""
import json
import os
from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import apenas_coordenacao, usuario_logado
from app.db import get_session
from app.services.ml import comparacao_ia, retreino
from app.services.ml.train_evaluator import REPORT_OUTPUT

router = APIRouter(dependencies=[Depends(usuario_logado)])


@router.get("/metrics")
async def get_ml_metrics():
    """Relatório completo do modelo local (validação cruzada, teste fixo, linhas de base, matriz de confusão)."""
    if not os.path.exists(REPORT_OUTPUT):
        raise HTTPException(status_code=404, detail="Relatório de métricas ainda não foi gerado.")
    with open(REPORT_OUTPUT, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/aprendizado")
async def aprendizado(session: AsyncSession = Depends(get_session)):
    """Quantos casos reais já podem ensinar o modelo, histórico dos treinos e se há um treino rodando."""
    reais = await retreino.exemplos_reais(session)
    return {
        "exemplos_reais": len(reais),
        "por_fonte": {f: sum(1 for e in reais if e["fonte"] == f) for f in ("pessoa", "equipe")},
        "historico": list(reversed(retreino.historico())),
        "rodando": retreino.rodando(),
    }


@router.post("/retrain")
async def retrain_model(usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    """Treina com os relatos simulados + os casos reais e só troca o modelo em uso se o novo não piorar."""
    resultado = await retreino.retreinar(session, usuario.get("nome") or usuario.get("sub", ""))
    if resultado is None:
        raise HTTPException(status_code=409, detail="Já há um treino rodando. Espere terminar.")
    return resultado


@router.get("/comparacao")
async def ler_comparacao():
    """Último resultado de LLM x modelo local no conjunto de teste, e o andamento se estiver rodando."""
    return {"resultado": comparacao_ia.ler(), "estado": comparacao_ia.estado(), "llm_disponivel": bool(settings.GEMINI_API_KEY)}


@router.post("/comparacao", dependencies=[Depends(apenas_coordenacao)])
async def rodar_comparacao(background_tasks: BackgroundTasks):
    """Roda a comparação em segundo plano (uma chamada ao Gemini por relato do teste)."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=422, detail="Sem a chave do Gemini não dá para avaliar o LLM.")
    if comparacao_ia.estado()["rodando"]:
        raise HTTPException(status_code=409, detail="A comparação já está rodando.")
    background_tasks.add_task(comparacao_ia.comparar_em_fundo)
    return comparacao_ia.estado()
