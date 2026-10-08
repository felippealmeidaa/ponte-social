"""Aba "Modelo de IA": relatório do modelo local, comparação com o LLM e retreino com os casos reais.
Ler: qualquer pessoa da equipe. Rodar comparação ou retreino: só a coordenação."""
import json
import os
from typing import Any, Dict

from collections import Counter
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import apenas_coordenacao, usuario_logado
from app.db import get_session
from app.models import ExemploTreino
from app.services.ml import comparacao_ia, exemplos, retreino
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
        "exemplos_equipe": len(await exemplos.da_equipe(session, so_ativos=True)),
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


# ---------- Dados de treino (Configurações › Dados de treino) ----------

class ExemploRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=exemplos.TAMANHO_MAX + 50)
    categoria: str


class ExemploEdicao(BaseModel):
    texto: Optional[str] = Field(default=None, max_length=exemplos.TAMANHO_MAX + 50)
    categoria: Optional[str] = None
    ativo: Optional[bool] = None


def _autor(usuario: Dict[str, Any]) -> str:
    return usuario.get("nome") or usuario.get("sub", "")


@router.get("/exemplos")
async def listar_exemplos(session: AsyncSession = Depends(get_session)):
    """Os exemplos de treino das três origens e a contagem por necessidade (o que o próximo retreino vai usar)."""
    simulados = exemplos.simulados()
    equipe = await exemplos.da_equipe(session)
    reais = await retreino.exemplos_reais(session)
    no_treino = [s["categoria"] for s in simulados] + [e.categoria for e in equipe if e.ativo] + [r["categoria"] for r in reais]
    por_categoria = Counter(no_treino)
    return {
        "categorias": retreino.CATEGORIAS,
        "minimo_por_categoria": exemplos.MINIMO_POR_CATEGORIA,
        "por_categoria": {c: por_categoria.get(c, 0) for c in retreino.CATEGORIAS},
        "totais": {"simulados": len(simulados), "equipe": sum(e.ativo for e in equipe), "equipe_pausados": sum(not e.ativo for e in equipe),
                   "reais": len(reais), "no_treino": len(no_treino), "teste_fixo": len(exemplos.textos_do_teste())},
        "equipe": [exemplos.para_dict(e) for e in equipe],
        "reais": reais,
        "simulados": simulados,
    }


@router.post("/exemplos", status_code=201)
async def criar_exemplo(payload: ExemploRequest, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                        session: AsyncSession = Depends(get_session)):
    try:
        e = await exemplos.criar(session, payload.texto, payload.categoria, _autor(usuario))
    except exemplos.ExemploInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return exemplos.para_dict(e)


@router.patch("/exemplos/{exemplo_id}")
async def editar_exemplo(exemplo_id: str, payload: ExemploEdicao, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                         session: AsyncSession = Depends(get_session)):
    e = await session.get(ExemploTreino, exemplo_id)
    if not e:
        raise HTTPException(status_code=404, detail="Exemplo não encontrado.")
    try:
        e = await exemplos.editar(session, e, _autor(usuario), payload.texto, payload.categoria, payload.ativo)
    except exemplos.ExemploInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return exemplos.para_dict(e)


@router.delete("/exemplos/{exemplo_id}")
async def remover_exemplo(exemplo_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                          session: AsyncSession = Depends(get_session)):
    e = await session.get(ExemploTreino, exemplo_id)
    if not e:
        raise HTTPException(status_code=404, detail="Exemplo não encontrado.")
    await session.delete(e)
    await session.commit()
    return {"removido": exemplo_id}


@router.post("/exemplos/importar")
async def importar_exemplos(arquivo: UploadFile = File(...), usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                            session: AsyncSession = Depends(get_session)):
    """Planilha .xlsx, CSV (colunas texto e categoria) ou JSON. Cada linha passa pelas mesmas travas de um exemplo escrito à mão."""
    conteudo = await arquivo.read()
    if len(conteudo) > 2_000_000:
        raise HTTPException(status_code=413, detail="O arquivo pode ter no máximo 2 MB.")
    try:
        linhas = exemplos.ler_arquivo(conteudo, arquivo.filename or "")
    except (exemplos.ExemploInvalido, ValueError) as erro:
        raise HTTPException(status_code=422, detail=str(erro) if isinstance(erro, exemplos.ExemploInvalido) else "Não consegui ler o arquivo. Use a planilha modelo (.xlsx), CSV com as colunas texto e categoria, ou JSON.")
    if not linhas:
        raise HTTPException(status_code=422, detail="O arquivo não tem nenhuma linha de exemplo.")
    if len(linhas) > 5000:
        raise HTTPException(status_code=422, detail="Importe no máximo 5.000 linhas por vez.")
    return await exemplos.importar(session, linhas, _autor(usuario))


@router.get("/exemplos.csv")
async def exportar_exemplos(origem: Literal["todos", "simulados", "equipe", "reais"] = "todos",
                            session: AsyncSession = Depends(get_session)):
    """Planilha com os exemplos que entram no treino (separador ponto e vírgula, abre direto no Excel)."""
    linhas = []
    if origem in ("todos", "simulados"):
        linhas += [{**s, "origem": "simulado"} for s in exemplos.simulados()]
    if origem in ("todos", "equipe"):
        linhas += [{"texto": e.texto, "categoria": e.categoria, "origem": e.origem} for e in await exemplos.da_equipe(session, so_ativos=True)]
    if origem in ("todos", "reais"):
        linhas += [{"texto": r["texto"], "categoria": r["categoria"], "origem": f"caso real ({r['fonte']})"} for r in await retreino.exemplos_reais(session)]
    return Response(exemplos.planilha_csv(linhas), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="dados-de-treino-{origem}.csv"'})
