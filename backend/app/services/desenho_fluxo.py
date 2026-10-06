"""
Fluxo personalizável no painel: cada CRAS (ou a secretaria) arrasta os quadradinhos e acrescenta
mensagens extras entre as etapas. A sequência da conversa continua no código (fluxo_conversa.py);
as extras são mensagens a mais que o bot envia logo antes da etapa escolhida.

Travado: nenhuma extra antes do aceite (LGPD) nem na faixa de violência. O CRAS que ainda não mexeu
nas extras usa as da secretaria; as posições também.
"""
import re
import uuid
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DesenhoFluxo, agora, iso

PADRAO = "padrao"
# Etapas antes das quais dá para pôr uma mensagem extra (ids do fluxo no painel)
ANCORAS = ("bairro", "relato", "confirmacao", "caminho", "fila", "encerrado")
MAX_EXTRAS = 12
MAX_POSICOES = 80
MAX_TEXTO = 1000
_ID = re.compile(r"^[a-z0-9_-]{1,40}$")


async def _linha(session: AsyncSession, unidade: Optional[str]) -> Optional[DesenhoFluxo]:
    return await session.get(DesenhoFluxo, unidade or PADRAO)


async def ler(session: AsyncSession, unidade: Optional[str] = None) -> dict:
    propria = await _linha(session, unidade)
    padrao = await _linha(session, None) if unidade else propria
    usa = lambda campo: getattr(propria, campo) if propria and getattr(propria, campo) is not None else (  # noqa: E731
        getattr(padrao, campo) if padrao else None)
    return {
        "posicoes": usa("posicoes") or {},
        "extras": usa("extras") or [],
        "ancoras": list(ANCORAS),
        "posicoes_proprias": bool(propria and propria.posicoes is not None),
        "extras_proprias": bool(propria and propria.extras is not None),
        "atualizado_em": iso(propria.atualizado_em) if propria else None,
        "atualizado_por": propria.atualizado_por if propria else None,
    }


def validar(posicoes, extras) -> Optional[str]:
    if posicoes is not None:
        if not isinstance(posicoes, dict) or len(posicoes) > MAX_POSICOES:
            return "Posições inválidas."
        for chave, p in posicoes.items():
            if not _ID.match(str(chave)) or not isinstance(p, dict):
                return "Posições inválidas."
            if not all(isinstance(p.get(k), (int, float)) and -500 <= p[k] <= 6000 for k in ("x", "y")):
                return "Posições inválidas."
    if extras is not None:
        if not isinstance(extras, list) or len(extras) > MAX_EXTRAS:
            return f"No máximo {MAX_EXTRAS} mensagens extras."
        for e in extras:
            if not isinstance(e, dict) or e.get("antes_de") not in ANCORAS:
                return "Mensagem extra em lugar que não pode: antes do aceite e na violência o fluxo é travado."
            if not str(e.get("texto") or "").strip():
                return "A mensagem extra não pode ficar vazia."
            if len(str(e["texto"])) > MAX_TEXTO:
                return f"A mensagem extra pode ter até {MAX_TEXTO} caracteres."
            if e.get("id") is not None and not _ID.match(str(e["id"])):
                return "Mensagem extra inválida."
    return None


def _limpar_extras(extras: List[dict]) -> List[dict]:
    return [{
        "id": str(e.get("id") or f"x-{uuid.uuid4().hex[:8]}"),
        "antes_de": e["antes_de"],
        "titulo": (str(e.get("titulo") or "").strip() or "Mensagem extra")[:60],
        "texto": str(e["texto"]).strip(),
    } for e in extras]


async def salvar(session: AsyncSession, dados: dict, usuario: str, unidade: Optional[str] = None) -> dict:
    """Só mexe nos campos enviados. null volta a usar o da secretaria (no padrão, limpa)."""
    linha = await _linha(session, unidade)
    if linha is None:
        linha = DesenhoFluxo(unidade_id=unidade or PADRAO)
        session.add(linha)
    if "posicoes" in dados:
        linha.posicoes = {k: {"x": round(v["x"]), "y": round(v["y"])} for k, v in dados["posicoes"].items()} \
            if dados["posicoes"] is not None else None
    if "extras" in dados:
        linha.extras = _limpar_extras(dados["extras"]) if dados["extras"] is not None else None
    linha.atualizado_em, linha.atualizado_por = agora(), usuario
    await session.commit()
    return await ler(session, unidade)


async def extras_antes(session: AsyncSession, etapa: str, unidade: Optional[str]) -> List[str]:
    """Textos das mensagens extras que vão logo antes da etapa, na ordem em que foram postas."""
    return [e["texto"] for e in (await ler(session, unidade))["extras"] if e["antes_de"] == etapa]
