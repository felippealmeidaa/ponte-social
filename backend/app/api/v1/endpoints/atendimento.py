"""Conversas do WhatsApp para o atendimento humano (tela "Conversas" do painel)."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import usuario_logado
from app.core.security import decrypt_secret
from app.db import get_session
from app.models import Conversa, Mensagem, Triagem, agora
from app.services import catalogo
from app.services.channels.evolution_adapter import EvolutionApiAdapter
from app.services.channels.meta_cloud_adapter import MetaCloudApiAdapter

router = APIRouter(dependencies=[Depends(usuario_logado)])
evolution_adapter = EvolutionApiAdapter()
meta_adapter = MetaCloudApiAdapter()


class RespostaRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


async def _conversa_ou_404(session: AsyncSession, conversa_id: str) -> Conversa:
    conversa = await session.get(Conversa, conversa_id)
    if conversa is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return conversa


async def enviar_pelo_canal(conversa: Conversa, texto: str) -> bool:
    """Envia pelo mesmo canal em que a pessoa escreveu. No simulador não há envio externo."""
    if conversa.canal == "simulador":
        return True
    telefone = decrypt_secret(conversa.telefone_cifrado)
    if not telefone:
        return False
    if conversa.canal == "meta":
        resultado = await meta_adapter.send_text_message(telefone, texto)
    else:
        resultado = await evolution_adapter.send_text_message(settings.EVOLUTION_INSTANCE_NAME, telefone, texto)
    return not (isinstance(resultado, dict) and resultado.get("status") == "error")


@router.get("/conversas")
async def listar_conversas(session: AsyncSession = Depends(get_session)):
    """Conversas mais recentes primeiro, com a última mensagem e a triagem ligada (se houver)."""
    conversas = (await session.execute(select(Conversa).order_by(Conversa.atualizado_em.desc()).limit(100))).scalars().all()
    ids = [c.telefone_hash for c in conversas]
    ultimas: Dict[str, Mensagem] = {}
    triagens: Dict[str, Triagem] = {}
    if ids:
        sub = select(Mensagem.conversa_id, func.max(Mensagem.id).label("mid")).where(Mensagem.conversa_id.in_(ids)).group_by(Mensagem.conversa_id).subquery()
        for m in (await session.execute(select(Mensagem).join(sub, Mensagem.id == sub.c.mid))).scalars():
            ultimas[m.conversa_id] = m
        for t in (await session.execute(select(Triagem).where(Triagem.conversa_id.in_(ids)).order_by(Triagem.criado_em))).scalars():
            triagens[t.conversa_id] = t  # fica a mais recente
    saida = []
    for c in conversas:
        ultima, triagem = ultimas.get(c.telefone_hash), triagens.get(c.telefone_hash)
        saida.append({
            "id": c.telefone_hash,
            "telefone_mascarado": c.telefone_mascarado,
            "canal": c.canal,
            "estado": c.estado,
            "atendimento_humano": c.atendimento_humano,
            "atendente": c.atendente,
            "nao_lidas": c.nao_lidas,
            "atualizado_em": _iso(c.atualizado_em),
            "ultima_mensagem": {"autor": ultima.autor, "texto": ultima.texto[:140]} if ultima else None,
            "triagem": {"id": triagem.id, "categoria": triagem.categoria, "prioridade": triagem.prioridade,
                        "status": triagem.status, "titulo": triagem.titulo_encaminhamento} if triagem else None,
        })
    return saida


@router.get("/conversas/{conversa_id}/mensagens")
async def mensagens_da_conversa(conversa_id: str, depois_de: int = 0, session: AsyncSession = Depends(get_session)):
    """Histórico da conversa. 'depois_de' permite buscar só as mensagens novas (id maior)."""
    conversa = await _conversa_ou_404(session, conversa_id)
    q = select(Mensagem).where(Mensagem.conversa_id == conversa_id, Mensagem.id > depois_de).order_by(Mensagem.id)
    mensagens = (await session.execute(q)).scalars().all()
    return {
        "conversa": {"id": conversa.telefone_hash, "telefone_mascarado": conversa.telefone_mascarado, "canal": conversa.canal,
                     "estado": conversa.estado, "atendimento_humano": conversa.atendimento_humano, "atendente": conversa.atendente},
        "mensagens": [{"id": m.id, "autor": m.autor, "texto": m.texto, "criado_em": _iso(m.criado_em)} for m in mensagens],
    }


@router.post("/conversas/{conversa_id}/lida")
async def marcar_como_lida(conversa_id: str, session: AsyncSession = Depends(get_session)):
    conversa = await _conversa_ou_404(session, conversa_id)
    conversa.nao_lidas = 0
    await session.commit()
    return {"ok": True}


@router.post("/conversas/{conversa_id}/assumir")
async def assumir_conversa(conversa_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                           session: AsyncSession = Depends(get_session)):
    """O atendente assume: o bot para de responder e a pessoa é avisada."""
    conversa = await _conversa_ou_404(session, conversa_id)
    if not conversa.atendimento_humano:
        conversa.atendimento_humano, conversa.atendente = True, usuario.get("sub")
        aviso = catalogo.texto("atendente_assumiu")
        session.add(Mensagem(conversa_id=conversa_id, autor="atendente", texto=aviso))
        conversa.atualizado_em = agora()
        await session.commit()
        await enviar_pelo_canal(conversa, aviso)
    return {"ok": True, "atendimento_humano": True}


@router.post("/conversas/{conversa_id}/devolver")
async def devolver_ao_bot(conversa_id: str, session: AsyncSession = Depends(get_session)):
    """Encerra o atendimento humano. A próxima mensagem da pessoa recomeça a conversa com o bot."""
    conversa = await _conversa_ou_404(session, conversa_id)
    conversa.atendimento_humano, conversa.atendente = False, None
    conversa.estado = "FINALIZADA"
    await session.commit()
    return {"ok": True, "atendimento_humano": False}


@router.post("/conversas/{conversa_id}/responder")
async def responder(conversa_id: str, req: RespostaRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                    session: AsyncSession = Depends(get_session)):
    """Resposta do atendente. Assume a conversa automaticamente, para o bot não responder junto."""
    conversa = await _conversa_ou_404(session, conversa_id)
    if not conversa.atendimento_humano:
        conversa.atendimento_humano, conversa.atendente = True, usuario.get("sub")
    mensagem = Mensagem(conversa_id=conversa_id, autor="atendente", texto=req.texto.strip())
    session.add(mensagem)
    conversa.atualizado_em, conversa.nao_lidas = agora(), 0
    await session.commit()
    enviada = await enviar_pelo_canal(conversa, req.texto.strip())
    return {"id": mensagem.id, "enviada": enviada,
            "aviso": None if enviada else "Mensagem salva, mas o WhatsApp não confirmou o envio. Verifique a conexão em Configurações."}
