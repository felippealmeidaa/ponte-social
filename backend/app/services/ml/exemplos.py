"""
Dados de treino (Configurações › Dados de treino): os exemplos que ensinam o modelo local, num lugar só.

Três origens, lado a lado:
- simulados: as frases-modelo do arquivo de treino (data/relatos_treino_social.json), só leitura;
- equipe: frases escritas ou importadas pela coordenação (tabela exemplos_treino), editáveis;
- casos reais: relatos confirmados pela pessoa ou corrigidos pela equipe, com consentimento (retreino.exemplos_reais).

Duas travas: todo texto passa pela mesma anonimização dos relatos, e nenhum exemplo igual a um relato do
teste fixo entra no treino (senão a nota do modelo ficaria inflada).
"""
import csv
import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExemploTreino, iso
from app.services.anonimizacao import anonimizar_texto
from app.services.ml.train_evaluator import CATEGORIAS, DATASET_PATH, TEST_PATH

TAMANHO_MAX = 600
MINIMO_POR_CATEGORIA = 30  # abaixo disso a necessidade aparece como "poucos exemplos"


def _chave(texto: str) -> str:
    return " ".join((texto or "").lower().split())


def textos_do_teste() -> set:
    with open(TEST_PATH, encoding="utf-8") as f:
        return {_chave(r["texto"]) for r in json.load(f)["relatos"]}


def simulados() -> List[Dict[str, str]]:
    with open(DATASET_PATH, encoding="utf-8") as f:
        vistos, saida = set(), []
        for r in json.load(f):
            if _chave(r["texto"]) not in vistos:
                vistos.add(_chave(r["texto"]))
                saida.append({"texto": r["texto"], "categoria": r["categoria"]})
        return saida


class ExemploInvalido(ValueError):
    pass


def validar(texto: str, categoria: str, existentes: set, teste: set) -> str:
    """Devolve o texto limpo e anonimizado, ou levanta ExemploInvalido com o motivo em português."""
    texto = " ".join((texto or "").split())
    if len(texto) < 12 or len(texto.split()) < 3:
        raise ExemploInvalido("Escreva a frase inteira, como a pessoa contaria (pelo menos 3 palavras).")
    if len(texto) > TAMANHO_MAX:
        raise ExemploInvalido(f"A frase pode ter no máximo {TAMANHO_MAX} caracteres.")
    if categoria not in CATEGORIAS:
        raise ExemploInvalido("Escolha uma das necessidades da lista.")
    texto = anonimizar_texto(texto)
    if _chave(texto) in teste:
        raise ExemploInvalido("Essa frase está no teste fixo do modelo; se entrar no treino, a nota fica inflada.")
    if _chave(texto) in existentes:
        raise ExemploInvalido("Já existe um exemplo com essa frase.")
    return texto


def para_dict(e: ExemploTreino) -> Dict[str, Any]:
    return {"id": e.id, "texto": e.texto, "categoria": e.categoria, "origem": e.origem, "ativo": e.ativo,
            "criado_em": iso(e.criado_em), "criado_por": e.criado_por,
            "atualizado_em": iso(e.atualizado_em), "atualizado_por": e.atualizado_por}


async def da_equipe(session: AsyncSession, so_ativos: bool = False) -> List[ExemploTreino]:
    consulta = select(ExemploTreino).order_by(ExemploTreino.criado_em.desc())
    if so_ativos:
        consulta = consulta.where(ExemploTreino.ativo.is_(True))
    return list((await session.execute(consulta)).scalars())


async def _chaves_existentes(session: AsyncSession, ignorar_id: Optional[str] = None) -> set:
    chaves = {_chave(s["texto"]) for s in simulados()}
    chaves |= {_chave(e.texto) for e in await da_equipe(session) if e.id != ignorar_id}
    return chaves


async def criar(session: AsyncSession, texto: str, categoria: str, autor: str, origem: str = "manual") -> ExemploTreino:
    limpo = validar(texto, categoria, await _chaves_existentes(session), textos_do_teste())
    e = ExemploTreino(id=uuid.uuid4().hex[:16], texto=limpo, categoria=categoria, origem=origem, criado_por=autor)
    session.add(e)
    await session.commit()
    return e


async def editar(session: AsyncSession, e: ExemploTreino, autor: str, texto: Optional[str] = None,
                 categoria: Optional[str] = None, ativo: Optional[bool] = None) -> ExemploTreino:
    if texto is not None or categoria is not None:
        e.texto = validar(texto if texto is not None else e.texto, categoria or e.categoria,
                          await _chaves_existentes(session, ignorar_id=e.id), textos_do_teste())
        e.categoria = categoria or e.categoria
    if ativo is not None:
        e.ativo = ativo
    e.atualizado_em, e.atualizado_por = datetime.now(timezone.utc), autor
    await session.commit()
    return e


def ler_arquivo(conteudo: bytes, nome: str) -> List[Tuple[str, str]]:
    """CSV (colunas texto e categoria, separador vírgula ou ponto e vírgula) ou JSON ([{texto, categoria}])."""
    bruto = conteudo.decode("utf-8-sig", errors="replace")
    if nome.lower().endswith(".json"):
        dados = json.loads(bruto)
        if isinstance(dados, dict):
            dados = dados.get("relatos") or dados.get("exemplos") or []
        return [(str(d.get("texto", "")), str(d.get("categoria", "")).strip()) for d in dados if isinstance(d, dict)]
    dialeto = csv.Sniffer().sniff(bruto[:2000], delimiters=",;") if bruto.strip() else csv.excel
    leitor = csv.DictReader(io.StringIO(bruto), dialect=dialeto)
    colunas = {(c or "").strip().lower(): c for c in (leitor.fieldnames or [])}
    if "texto" not in colunas or "categoria" not in colunas:
        raise ExemploInvalido("O arquivo precisa das colunas 'texto' e 'categoria'.")
    return [(linha.get(colunas["texto"]) or "", (linha.get(colunas["categoria"]) or "").strip()) for linha in leitor]


async def importar(session: AsyncSession, linhas: List[Tuple[str, str]], autor: str) -> Dict[str, Any]:
    existentes, teste = await _chaves_existentes(session), textos_do_teste()
    criados, recusados = 0, []
    for n, (texto, categoria) in enumerate(linhas, start=2):  # linha 1 é o cabeçalho
        try:
            limpo = validar(texto, categoria, existentes, teste)
        except ExemploInvalido as erro:
            recusados.append({"linha": n, "texto": texto[:80], "motivo": str(erro)})
            continue
        existentes.add(_chave(limpo))
        session.add(ExemploTreino(id=uuid.uuid4().hex[:16], texto=limpo, categoria=categoria, origem="importacao", criado_por=autor))
        criados += 1
    await session.commit()
    return {"criados": criados, "recusados": recusados[:50], "total_recusados": len(recusados)}


def planilha_csv(linhas: List[Dict[str, str]]) -> bytes:
    saida = io.StringIO()
    escritor = csv.writer(saida, delimiter=";")
    escritor.writerow(["texto", "categoria", "origem"])
    for linha in linhas:
        escritor.writerow([linha["texto"], linha["categoria"], linha["origem"]])
    return ("﻿" + saida.getvalue()).encode("utf-8")  # BOM: o Excel abre os acentos certos
