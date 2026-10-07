"""
Aprender com os casos reais: relatos que a pessoa confirmou no WhatsApp ("está certo") ou que a equipe corrigiu
no painel viram exemplos de treino (só com o consentimento dado no aceite).

O modelo novo é treinado com os relatos simulados + os reais e avaliado no MESMO conjunto de teste fixo
(nunca usado no treino). Ele só substitui o modelo em uso se não piorar: o reconhecimento de violência não
pode cair e o F1 macro não pode cair mais que TOLERANCIA_F1. Cada treino fica no histórico, troque ou não.
"""
import asyncio
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Triagem
from app.services.ml import exemplos as exemplos_equipe
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.train_evaluator import (BASE_DIR, CATEGORIAS, DATASET_PATH, MODEL_OUTPUT, REPORT_OUTPUT,
                                             train_and_evaluate)

HISTORICO = os.path.join(BASE_DIR, "historico_treinos.json")
TOLERANCIA_F1 = 0.01
_estado: Dict[str, Any] = {"rodando": False}


async def exemplos_reais(session: AsyncSession) -> List[Dict[str, str]]:
    """Casos com consentimento, fora da demonstração, com a necessidade confirmada pela pessoa ou corrigida pela equipe."""
    q = select(Triagem).where(
        Triagem.canal != "demo", Triagem.consentiu_uso_para_treino.is_(True),
        or_(Triagem.categoria_confirmada_pelo_cidadao.is_(True), Triagem.corrigida_por.is_not(None)),
    )
    vistos, saida = set(), []
    for t in (await session.execute(q)).scalars():
        texto = (t.relato_traducao or t.relato_anonimizado or "").strip()
        if texto and t.categoria in CATEGORIAS and texto.lower() not in vistos:
            vistos.add(texto.lower())
            saida.append({"texto": texto, "categoria": t.categoria,
                          "fonte": "equipe" if t.corrigida_por else "pessoa"})
    return saida


def _resumo(relatorio: dict) -> dict:
    s = relatorio["modelo_final"]["teste_sistema_completo"]
    return {"modelo": relatorio["modelo_final"]["nome"], "f1_macro": round(s["f1_macro"], 4),
            "acuracia": round(s["acuracia"], 4), "recall_violencia": round(s["recall_violencia"], 4),
            "treino": relatorio["dataset_size"], "exemplos_reais": relatorio.get("exemplos_reais", 0)}


def historico() -> List[dict]:
    try:
        with open(HISTORICO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def _guardar_historico(item: dict) -> None:
    lista = (historico() + [item])[-30:]
    with open(HISTORICO, "w", encoding="utf-8") as f:
        json.dump(lista, f, indent=2, ensure_ascii=False)


def _treinar(reais: List[Dict[str, str]], usuario: str) -> dict:
    """Roda no thread: treina num diretório temporário e só copia por cima se o modelo novo não piorar."""
    with open(REPORT_OUTPUT, encoding="utf-8") as f:
        atual = _resumo(json.load(f))
    pasta = tempfile.mkdtemp(prefix="retreino_")
    try:
        modelo_novo, relatorio_novo = os.path.join(pasta, "modelo.joblib"), os.path.join(pasta, "relatorio.json")
        novo = _resumo(train_and_evaluate(DATASET_PATH, modelo_novo, relatorio_novo,
                                          exemplos_reais=[{"texto": e["texto"], "categoria": e["categoria"]} for e in reais],
                                          n_jobs=1))
        motivos = []
        if novo["recall_violencia"] < atual["recall_violencia"]:
            motivos.append("reconheceria menos casos de violência")
        if novo["f1_macro"] < atual["f1_macro"] - TOLERANCIA_F1:
            motivos.append("acertaria menos as necessidades (F1 menor)")
        trocou = not motivos
        if trocou:
            shutil.copyfile(modelo_novo, MODEL_OUTPUT)
            shutil.copyfile(relatorio_novo, REPORT_OUTPUT)
            SocialClassifierService._artefato = None  # a próxima classificação carrega o modelo novo
        item = {
            "em": datetime.now(timezone.utc).isoformat(), "por": usuario, "antes": atual, "depois": novo,
            "trocou": trocou, "motivo": "; ".join(motivos) if motivos else "não piorou: o modelo novo está em uso",
            "reais_por_fonte": {f: sum(1 for e in reais if e["fonte"] == f) for f in ("pessoa", "equipe", "exemplos")},
        }
        _guardar_historico(item)
        return item
    finally:
        shutil.rmtree(pasta, ignore_errors=True)


async def retreinar(session: AsyncSession, usuario: str) -> Optional[dict]:
    """Devolve o resultado, ou None se já houver um treino rodando."""
    if _estado["rodando"]:
        return None
    _estado["rodando"] = True
    try:
        reais = await exemplos_reais(session)
        # Exemplos escritos ou importados pela equipe em Dados de treino (só os ativos)
        reais += [{"texto": e.texto, "categoria": e.categoria, "fonte": "exemplos"}
                  for e in await exemplos_equipe.da_equipe(session, so_ativos=True)]
        return await asyncio.to_thread(_treinar, reais, usuario)
    finally:
        _estado["rodando"] = False


def rodando() -> bool:
    return bool(_estado["rodando"])
