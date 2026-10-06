"""
Lugares da rede do município (CRAS, CREAS, Centro POP, restaurante popular, Vapt Vupt, SINE...).

Cada lugar tem as necessidades que atende, os bairros que atende (CRAS) e o ponto no mapa. Com o ponto da
pessoa (pino do WhatsApp ou centro do bairro que ela digitou), o bot indica os lugares mais perto para a
necessidade dela. Sem ponto, vale a lista de bairros de cada CRAS.

Em development, com a tabela vazia, carrega a rede pública de Anápolis pesquisada em fontes oficiais
(backend/data/rede_anapolis.json), marcada como não conferida.
"""
import difflib
import json
import uuid
from datetime import date
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import UnidadeAtendimento, agora
from app.services import geo
from app.services.ml.text_rules import normalizar
from app.services.ml.train_evaluator import CATEGORIAS, VIOLENCIA

TIPOS = ("CRAS", "CREAS", "CENTRO_POP", "CADUNICO", "RESTAURANTE_POPULAR", "DOCUMENTOS", "SINE", "OUTRO")
# Necessidades que cada tipo de lugar atende quando a unidade não define as suas
CATEGORIAS_POR_TIPO = {
    "CRAS": [c for c in CATEGORIAS if c != VIOLENCIA],
    "CREAS": [VIOLENCIA],
    "CENTRO_POP": ["moradia", "alimentacao", "documentacao"],
    "CADUNICO": ["cadastro_atualizacao", "renda_beneficio"],
    "RESTAURANTE_POPULAR": ["alimentacao"],
    "DOCUMENTOS": ["documentacao"],
    "SINE": ["trabalho_renda"],
    "OUTRO": [],
}
NAO_SEI = {"nao sei", "nao lembro", "sei la", "n sei", "nao", "nenhum", "pular"}
# Tolera erros de digitação ("jaiaira" → "Jaiara"), sem confundir bairros diferentes
SEMELHANCA_MINIMA = 0.82
# Até 2 lugares onde se pede o benefício (CRAS, CadÚnico, documentos, SINE, CREAS) e, depois, até 2 de
# ajuda imediata (comer hoje, pernoitar). Quem procura o benefício quase sempre não tem como pagar: o lugar
# do benefício vem primeiro, mesmo que um restaurante popular esteja mais perto.
LOCAIS_POR_RESPOSTA = 2
LOCAIS_DE_APOIO = 2
TIPOS_APOIO = {"RESTAURANTE_POPULAR", "CENTRO_POP", "OUTRO"}
REDE_EXEMPLO = Path(__file__).resolve().parents[2] / "data" / "rede_anapolis.json"


def categorias_da(u: UnidadeAtendimento) -> List[str]:
    return list(u.categorias) if u.categorias else CATEGORIAS_POR_TIPO.get(u.tipo, [])


def ponto_da(u: UnidadeAtendimento) -> Optional[geo.Ponto]:
    return (u.latitude, u.longitude) if u.latitude is not None and u.longitude is not None else None


def para_dict(u: UnidadeAtendimento) -> dict:
    return {
        "id": u.id, "nome": u.nome, "tipo": u.tipo, "endereco": u.endereco, "telefone": u.telefone,
        "horario": u.horario, "bairros": u.bairros or [], "fonte": u.fonte or "",
        "latitude": u.latitude, "longitude": u.longitude, "categorias": categorias_da(u),
        "mapa": geo.link_mapa(u.latitude, u.longitude, u.endereco) if (ponto_da(u) or u.endereco) else None,
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


def _nota_bairro(unidade: UnidadeAtendimento, alvo: str) -> float:
    """Quanto o bairro digitado se parece com um dos bairros atendidos pela unidade (0 a 1)."""
    nota = 0.0
    for b in unidade.bairros or []:
        nome = normalizar(b)
        nota = max(nota, 1.0 if nome == alvo else difflib.SequenceMatcher(None, nome, alvo).ratio())
    return nota


def _alvo(bairro: Optional[str]) -> str:
    alvo = normalizar(bairro or "").removeprefix("bairro ").removeprefix("setor ").strip()
    return "" if alvo in NAO_SEI else alvo


async def cras_do_bairro(session: AsyncSession, bairro: str) -> Optional[UnidadeAtendimento]:
    """CRAS ativo que atende o bairro informado (comparação sem acento e tolerante a erro de digitação)."""
    alvo = _alvo(bairro)
    if not alvo:
        return None
    melhor, nota = None, 0.0
    for unidade in await listar(session, apenas_ativas=True):
        if unidade.tipo == "CRAS" and (n := _nota_bairro(unidade, alvo)) > nota:
            melhor, nota = unidade, n
    return melhor if nota >= SEMELHANCA_MINIMA else None


async def cras_mais_perto(session: AsyncSession, ponto: geo.Ponto) -> Optional[UnidadeAtendimento]:
    com_ponto = [u for u in await listar(session, apenas_ativas=True) if u.tipo == "CRAS" and ponto_da(u)]
    return min(com_ponto, key=lambda u: geo.distancia_km(ponto, ponto_da(u)), default=None)


async def cras_de_referencia(session: AsyncSession, bairro: Optional[str], ponto: Optional[geo.Ponto]) -> Optional[UnidadeAtendimento]:
    """A lista de bairros da prefeitura manda; sem ela, o CRAS mais perto do ponto da pessoa."""
    if bairro and (cras := await cras_do_bairro(session, bairro)):
        return cras
    return await cras_mais_perto(session, ponto) if ponto else None


async def locais_para(session: AsyncSession, categoria: str, ponto: Optional[geo.Ponto] = None,
                      bairro: Optional[str] = None, limite: int = LOCAIS_POR_RESPOSTA,
                      cras_id: Optional[str] = None) -> List[Tuple[UnidadeAtendimento, Optional[float]]]:
    """Lugares ativos que atendem a necessidade, com a distância em km (None quando não dá para medir).
    Primeiro os lugares onde se pede o benefício: o CRAS de referência da pessoa (cras_id), os CRAS que atendem
    o bairro dela pela lista oficial e os outros, do mais perto ao mais longe. Depois, os de ajuda imediata."""
    candidatos = [u for u in await listar(session, apenas_ativas=True) if categoria in categorias_da(u)]
    alvo = _alvo(bairro)
    ordenados = []
    for u in candidatos:
        p = ponto_da(u)
        km = geo.distancia_km(ponto, p) if ponto and p else None
        atende_bairro = bool(alvo) and _nota_bairro(u, alvo) >= SEMELHANCA_MINIMA
        ordenados.append(((u.id != cras_id, not atende_bairro, km is None, km or 0.0, u.nome), u, km))
    ordenados.sort(key=lambda x: x[0])
    principais = [(u, km) for _, u, km in ordenados if not e_apoio(u)][:limite]
    apoio = [(u, km) for _, u, km in ordenados if e_apoio(u)][:LOCAIS_DE_APOIO]
    return principais + apoio


def e_apoio(u: UnidadeAtendimento) -> bool:
    """Ajuda imediata (restaurante popular, Centro POP, outros parceiros): não é onde se pede o benefício."""
    return u.tipo in TIPOS_APOIO


def descricao(u: UnidadeAtendimento, km: Optional[float] = None) -> str:
    """Bloco do WhatsApp com nome, distância, endereço, horário, telefone e link do mapa."""
    linhas = [f"*{u.nome}*" + (f" (a {geo.texto_distancia(km)})" if km is not None else "")]
    if u.endereco:
        linhas.append(u.endereco)
    detalhes = ". ".join(p for p in (u.horario, f"Tel.: {u.telefone}" if u.telefone else "") if p)
    if detalhes:
        linhas.append(detalhes)
    if ponto_da(u) or u.endereco:
        linhas.append(f"Como chegar: {geo.link_mapa(u.latitude, u.longitude, u.endereco)}")
    return "\n".join(linhas)


def bloco_locais(locais: Sequence[Tuple[UnidadeAtendimento, Optional[float]]],
                 titulo: str = "📍 *Onde pedir o benefício:*") -> str:
    """Primeiro o lugar do benefício, com destaque; a ajuda imediata vem num bloco separado, depois."""
    principais = [descricao(u, km) for u, km in locais if not e_apoio(u)]
    apoio = [descricao(u, km) for u, km in locais if e_apoio(u)]
    partes = []
    if principais:
        partes.append(titulo + "\n\n" + "\n\n".join(principais))
    if apoio:
        titulo_apoio = "🍽️ *Para ajuda imediata, enquanto isso:*" if principais else "📍 *Lugares que podem ajudar:*"
        partes.append(titulo_apoio + "\n\n" + "\n\n".join(apoio))
    return "\n\n".join(partes)


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
    categorias = [c for c in dados.get("categorias") or [] if c in CATEGORIAS]
    # Igual ao padrão do tipo: guarda vazio, para acompanhar o padrão se ele mudar
    padrao = CATEGORIAS_POR_TIPO.get(unidade.tipo, [])
    unidade.categorias = None if not categorias or sorted(categorias) == sorted(padrao) else categorias
    unidade.latitude, unidade.longitude = dados.get("latitude"), dados.get("longitude")
    # Sem ponto no mapa, procura pelo endereço (o painel também tem o botão "Achar no mapa")
    if unidade.endereco and (unidade.latitude is None or unidade.longitude is None):
        if ponto := await geo.buscar(unidade.endereco):
            unidade.latitude, unidade.longitude = ponto
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


async def carregar_rede_exemplo(session: AsyncSession) -> int:
    """Só em development e com a tabela vazia: a rede pública pesquisada, marcada como não conferida."""
    if settings.ENVIRONMENT != "development" or not settings.CARREGAR_REDE_EXEMPLO or not REDE_EXEMPLO.exists():
        return 0
    if (await session.execute(select(func.count()).select_from(UnidadeAtendimento))).scalar_one():
        return 0
    dados = json.loads(REDE_EXEMPLO.read_text(encoding="utf-8"))["unidades"]
    for d in dados:
        session.add(UnidadeAtendimento(
            id=f"uni-{uuid.uuid4().hex[:8]}", nome=d["nome"], tipo=d["tipo"], endereco=d.get("endereco", ""),
            telefone=d.get("telefone", ""), horario=d.get("horario", ""), bairros=d.get("bairros", []),
            categorias=d.get("categorias"), latitude=d.get("latitude"), longitude=d.get("longitude"),
            fonte="Não conferido com a prefeitura. " + d.get("fonte", ""), verificado_em=None, ativo=True,
            atualizado_em=agora(), atualizado_por="rede pública (exemplo)",
        ))
    await session.commit()
    return len(dados)
