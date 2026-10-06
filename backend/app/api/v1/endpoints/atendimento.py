"""Conversas do WhatsApp para o atendimento humano (tela "Conversas" do painel)."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import escopo, pode_ver, usuario_logado
from app.db import get_session
from app.models import Conversa, Mensagem, Triagem, agora, iso
from app.services import catalogo
from app.services.channels.envio import enviar_pelo_canal
from app.services.llm.traducao import traduzir

router = APIRouter(dependencies=[Depends(usuario_logado)])


class RespostaRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)
    # Pessoa que fala espanhol: o atendente escreve em português e a mensagem sai traduzida
    traduzir: bool = True


def _iso(dt) -> Optional[str]:
    return iso(dt)


async def _conversa_ou_404(session: AsyncSession, conversa_id: str, usuario: Dict[str, Any]) -> Conversa:
    conversa = await session.get(Conversa, conversa_id)
    if conversa is None or not pode_ver(usuario, conversa.unidade_id):
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return conversa


@router.get("/conversas")
async def listar_conversas(usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Conversas mais recentes primeiro, com a última mensagem e a triagem ligada (se houver).
    Conta de um CRAS vê só as conversas da sua unidade."""
    consulta = select(Conversa).order_by(Conversa.atualizado_em.desc()).limit(100)
    if escopo(usuario):
        consulta = consulta.where(Conversa.unidade_id == escopo(usuario))
    conversas = (await session.execute(consulta)).scalars().all()
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
async def mensagens_da_conversa(conversa_id: str, depois_de: int = 0, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Histórico da conversa. 'depois_de' permite buscar só as mensagens novas (id maior)."""
    conversa = await _conversa_ou_404(session, conversa_id, usuario)
    q = select(Mensagem).where(Mensagem.conversa_id == conversa_id, Mensagem.id > depois_de).order_by(Mensagem.id)
    mensagens = (await session.execute(q)).scalars().all()
    return {
        "conversa": {"id": conversa.telefone_hash, "telefone_mascarado": conversa.telefone_mascarado, "canal": conversa.canal,
                     "estado": conversa.estado, "atendimento_humano": conversa.atendimento_humano, "atendente": conversa.atendente,
                     "idioma": conversa.idioma},
        "mensagens": [{"id": m.id, "autor": m.autor, "texto": m.texto, "traducao": m.traducao, "criado_em": _iso(m.criado_em)}
                      for m in mensagens],
    }


@router.post("/conversas/{conversa_id}/lida")
async def marcar_como_lida(conversa_id: str, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    conversa = await _conversa_ou_404(session, conversa_id, usuario)
    conversa.nao_lidas = 0
    await session.commit()
    return {"ok": True}


@router.post("/conversas/{conversa_id}/assumir")
async def assumir_conversa(conversa_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                           session: AsyncSession = Depends(get_session)):
    """O atendente assume: o bot para de responder e a pessoa é avisada."""
    conversa = await _conversa_ou_404(session, conversa_id, usuario)
    if not conversa.atendimento_humano:
        conversa.atendimento_humano, conversa.atendente = True, usuario.get("sub")
        aviso = catalogo.texto("atendente_assumiu", conversa.unidade_id)
        session.add(Mensagem(conversa_id=conversa_id, autor="atendente", texto=aviso))
        conversa.atualizado_em = agora()
        await session.commit()
        await enviar_pelo_canal(conversa, aviso)
    return {"ok": True, "atendimento_humano": True}


@router.post("/conversas/{conversa_id}/devolver")
async def devolver_ao_bot(conversa_id: str, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Encerra o atendimento humano. A próxima mensagem da pessoa recomeça a conversa com o bot."""
    conversa = await _conversa_ou_404(session, conversa_id, usuario)
    conversa.atendimento_humano, conversa.atendente = False, None
    conversa.estado = "FINALIZADA"
    await session.commit()
    return {"ok": True, "atendimento_humano": False}


@router.post("/conversas/{conversa_id}/responder")
async def responder(conversa_id: str, req: RespostaRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                    session: AsyncSession = Depends(get_session)):
    """Resposta do atendente. Assume a conversa automaticamente, para o bot não responder junto."""
    conversa = await _conversa_ou_404(session, conversa_id, usuario)
    if not conversa.atendimento_humano:
        conversa.atendimento_humano, conversa.atendente = True, usuario.get("sub")
    texto = req.texto.strip()
    saida = (await traduzir([texto], "es"))[0] if conversa.idioma == "es" and req.traduzir else texto
    mensagem = Mensagem(conversa_id=conversa_id, autor="atendente", texto=saida, traducao=texto if saida != texto else None)
    session.add(mensagem)
    conversa.atualizado_em, conversa.nao_lidas = agora(), 0
    await session.commit()
    enviada = await enviar_pelo_canal(conversa, saida)
    return {"id": mensagem.id, "enviada": enviada, "traduzida": saida != texto,
            "aviso": None if enviada else "Mensagem salva, mas o WhatsApp não confirmou o envio. Verifique a conexão em Configurações."}
