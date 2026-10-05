"""
Unidades de atendimento (CRAS, CREAS, Centro POP) e os bairros que cada uma atende.

A tabela começa vazia: deve ser preenchida pelo painel com a lista oficial da prefeitura.
Enquanto não houver CRAS cadastrado, o bot não pergunta o bairro e usa o texto genérico do catálogo.
"""
import difflib
import uuid
from datetime import date
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UnidadeAtendimento, agora
from app.services.ml.text_rules import normalizar

TIPOS = ("CRAS", "CREAS", "CENTRO_POP")
NAO_SEI = {"nao sei", "nao lembro", "sei la", "n sei", "nao", "nenhum", "pular"}
# Tolera erros de digitação ("jaiaira" → "Jaiara"), sem confundir bairros diferentes
SEMELHANCA_MINIMA = 0.82


def para_dict(u: UnidadeAtendimento) -> dict:
    return {
        "id": u.id, "nome": u.nome, "tipo": u.tipo, "endereco": u.endereco, "telefone": u.telefone,
        "horario": u.horario, "bairros": u.bairros or [], "fonte": u.fonte or "",
        "verificado_em": u.verificado_em.isoformat() if u.verificado_em else None, "ativo": u.ativo,
        "atualizado_em": u.atualizado_em.isoformat() if u.atualizado_em else None, "atualizado_por": u.atualizado_por,
    }


def _limpar_bairros(bairros: List[str]) -> List[str]:
    vistos, saida = set(), []
    for b in bairros:
        b = (b or "").strip()
        if b and normalizar(b) not in vistos:
            vistos.add(normalizar(b))
            saida.append(b)
    return saida


async def listar(session: AsyncSession, apenas_ativas: bool = False) -> List[UnidadeAtendimento]:
    consulta = select(UnidadeAtendimento).order_by(UnidadeAtendimento.tipo, UnidadeAtendimento.nome)
    if apenas_ativas:
        consulta = consulta.where(UnidadeAtendimento.ativo.is_(True))
    return list((await session.execute(consulta)).scalars())


async def tem_cras_ativo(session: AsyncSession) -> bool:
    return bool((await session.execute(
        select(func.count()).select_from(UnidadeAtendimento)
        .where(UnidadeAtendimento.tipo == "CRAS", UnidadeAtendimento.ativo.is_(True))
    )).scalar_one())


async def cras_do_bairro(session: AsyncSession, bairro: str) -> Optional[UnidadeAtendimento]:
    """CRAS ativo que atende o bairro informado (comparação sem acento e tolerante a erro de digitação)."""
    alvo = normalizar(bairro).removeprefix("bairro ").removeprefix("setor ").strip()
    if not alvo or alvo in NAO_SEI:
        return None
    melhor, nota = None, 0.0
    for unidade in await listar(session, apenas_ativas=True):
        if unidade.tipo != "CRAS":
            continue
        for b in unidade.bairros or []:
            nome = normalizar(b)
            semelhanca = 1.0 if nome == alvo else difflib.SequenceMatcher(None, nome, alvo).ratio()
            if semelhanca > nota:
                melhor, nota = unidade, semelhanca
    return melhor if nota >= SEMELHANCA_MINIMA else None


async def creas_ativo(session: AsyncSession) -> Optional[UnidadeAtendimento]:
    return (await session.execute(
        select(UnidadeAtendimento).where(UnidadeAtendimento.tipo == "CREAS", UnidadeAtendimento.ativo.is_(True))
        .order_by(UnidadeAtendimento.nome)
    )).scalars().first()


def descricao(u: UnidadeAtendimento) -> str:
    partes = [f"*{u.nome}*"]
    if u.endereco:
        partes.append(u.endereco)
    if u.horario:
        partes.append(u.horario)
    if u.telefone:
        partes.append(f"Tel.: {u.telefone}")
    return " — ".join(partes)


async def salvar(session: AsyncSession, dados: dict, usuario: str, unidade_id: Optional[str] = None) -> UnidadeAtendimento:
    unidade = await session.get(UnidadeAtendimento, unidade_id) if unidade_id else None
    if unidade_id and not unidade:
        raise ValueError("Unidade não encontrada.")
    if unidade is None:
        unidade = UnidadeAtendimento(id=f"uni-{uuid.uuid4().hex[:8]}")
        session.add(unidade)
    unidade.nome = dados["nome"].strip()
    unidade.tipo = dados["tipo"]
    unidade.endereco = (dados.get("endereco") or "").strip()
    unidade.telefone = (dados.get("telefone") or "").strip()
    unidade.horario = (dados.get("horario") or "").strip()
    unidade.bairros = _limpar_bairros(dados.get("bairros") or [])
    unidade.fonte = (dados.get("fonte") or "").strip()
    unidade.verificado_em = dados.get("verificado_em")
    unidade.ativo = bool(dados.get("ativo", True))
    unidade.atualizado_em, unidade.atualizado_por = agora(), usuario
    await session.commit()
    return unidade


async def remover(session: AsyncSession, unidade_id: str) -> None:
    unidade = await session.get(UnidadeAtendimento, unidade_id)
    if not unidade:
        raise ValueError("Unidade não encontrada.")
    await session.delete(unidade)
    await session.commit()


def data_valida(d: Optional[date]) -> bool:
    return d is None or d <= date.today()
