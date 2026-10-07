"""
Mapa de demandas por bairro (aba Indicadores).

Junta os casos por bairro e põe cada bairro num ponto só: a média dos pontos aproximados que as conversas
já guardam (pino do WhatsApp ou centro do bairro, arredondados a ~100 m) ou, sem nenhum, o centro do bairro
no mapa (Nominatim, com cache). Nenhum caso aparece sozinho no mapa: o ponto é do bairro, não da pessoa.
"""
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversa, Triagem, UnidadeAtendimento
from app.services import geo

SEM_BAIRRO = {"", "Não informado", "Localização pelo WhatsApp"}
# Bairros sem ponto que o mapa tenta achar por consulta (o Nominatim pede no máximo 1 por segundo)
MAX_BUSCAS = 8


async def montar(session: AsyncSession, itens: Sequence[Triagem], unidade_id: Optional[str] = None) -> Dict[str, Any]:
    ids_conversa = {t.conversa_id for t in itens if t.conversa_id}
    pontos_conversa: Dict[str, geo.Ponto] = {}
    if ids_conversa:
        consulta = select(Conversa.telefone_hash, Conversa.latitude, Conversa.longitude).where(
            Conversa.telefone_hash.in_(ids_conversa), Conversa.latitude.is_not(None), Conversa.longitude.is_not(None))
        pontos_conversa = {h: (lat, lng) for h, lat, lng in (await session.execute(consulta)).all()}

    por_bairro: Dict[str, List[Triagem]] = defaultdict(list)
    sem_bairro = 0
    for t in itens:
        bairro = (t.bairro or "").strip()
        if bairro in SEM_BAIRRO:
            sem_bairro += 1
        else:
            por_bairro[bairro].append(t)

    bairros, sem_ponto, buscas = [], [], 0
    for bairro, casos in sorted(por_bairro.items(), key=lambda kv: -len(kv[1])):
        pontos = [pontos_conversa[t.conversa_id] for t in casos if t.conversa_id in pontos_conversa]
        origem = "conversas"
        if pontos:
            centro: Optional[geo.Ponto] = (sum(p[0] for p in pontos) / len(pontos), sum(p[1] for p in pontos) / len(pontos))
        elif buscas < MAX_BUSCAS:
            buscas += 1
            centro, origem = await geo.buscar(bairro), "bairro"
        else:
            centro = None
        linha = {"bairro": bairro, "total": len(casos), "por_categoria": dict(Counter(t.categoria for t in casos).most_common()),
                 "urgentes": sum(t.prioridade == "URGENTE_VIOLENCIA" for t in casos)}
        if centro:
            bairros.append({**linha, "lat": round(centro[0], 4), "lng": round(centro[1], 4), "origem": origem})
        else:
            sem_ponto.append(linha)

    consulta_unidades = select(UnidadeAtendimento).where(
        UnidadeAtendimento.ativo.is_(True), UnidadeAtendimento.tipo == "CRAS", UnidadeAtendimento.latitude.is_not(None))
    if unidade_id:
        consulta_unidades = consulta_unidades.where(UnidadeAtendimento.id == unidade_id)
    referencias = [{"nome": u.nome, "lat": u.latitude, "lng": u.longitude}
                   for u in (await session.execute(consulta_unidades)).scalars()]

    return {"bairros": bairros, "sem_ponto": sem_ponto, "sem_bairro": sem_bairro, "unidades": referencias}
