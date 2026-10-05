from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Triagem
from app.services.live_chat.manager import live_chat_manager
from app.services.ml.classifier_service import SocialClassifierService
from app.services.triagens import STATUS_VALIDOS, TENANT_PADRAO, criar_triagem, listar, para_dict

router = APIRouter()


class TriagemRequest(BaseModel):
    relato: str = Field(min_length=1, max_length=4000)
    nome: Optional[str] = None
    telefone: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = "Anápolis"


class UpdateStatusRequest(BaseModel):
    status: str
    observacoes: Optional[str] = None


@router.post("/predizer")
async def predizer_relato(payload: TriagemRequest):
    """Classifica o relato sem salvar (simulador do painel)."""
    return SocialClassifierService.classify_relato(payload.relato)


@router.post("/submeter")
async def submeter_triagem(payload: TriagemRequest, session: AsyncSession = Depends(get_session)):
    """Classifica o relato e coloca na fila do CRAS (entrada pelo painel/web)."""
    classificacao = SocialClassifierService.classify_relato(payload.relato)
    triagem = await criar_triagem(
        session, payload.relato, classificacao, canal="web",
        telefone=payload.telefone, nome=payload.nome, bairro=payload.bairro, cidade=payload.cidade,
    )
    return {
        "triagem_id": triagem.id,
        "classificacao": classificacao,
        "mensagem": "Triagem registrada e encaminhada para a equipe do CRAS",
    }


@router.get("/fila")
async def listar_fila_triagens(
    status_filter: Optional[str] = None,
    prioridade_filter: Optional[str] = None,
    categoria_filter: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """Fila de triagens para o painel do CRAS, mais recentes primeiro."""
    itens = await listar(session, status_filter, prioridade_filter, categoria_filter)
    return [para_dict(t) for t in itens]


@router.patch("/{triagem_id}/status")
async def atualizar_status_triagem(triagem_id: str, payload: UpdateStatusRequest, session: AsyncSession = Depends(get_session)):
    if payload.status not in STATUS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Status inválido. Use um de: {sorted(STATUS_VALIDOS)}")
    triagem = await session.get(Triagem, triagem_id)
    if triagem is None:
        raise HTTPException(status_code=404, detail="Triagem não encontrada")
    triagem.status = payload.status
    triagem.atualizado_em = datetime.now(timezone.utc)
    if payload.observacoes:
        triagem.observacoes = payload.observacoes
    await session.commit()
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {
        "event": "STATUS_ATUALIZADO", "triagem_id": triagem_id, "novo_status": payload.status,
    })
    return {"message": "Status atualizado com sucesso", "triagem": para_dict(triagem)}


@router.get("/exemplos-rotulados")
async def exportar_exemplos_rotulados(session: AsyncSession = Depends(get_session)):
    """Relatos (já anonimizados) cuja categoria o próprio cidadão confirmou ou corrigiu no WhatsApp,
    com consentimento. São candidatos a novos exemplos de treino — revisar antes de usar."""
    q = select(Triagem).where(Triagem.categoria_confirmada_pelo_cidadao.is_(True), Triagem.consentiu_uso_para_treino.is_(True))
    itens = (await session.execute(q)).scalars().all()
    return [
        {"texto": t.relato_anonimizado, "categoria": t.categoria, "categoria_sugerida_pelo_modelo": t.categoria_modelo,
         "modelo_acertou": t.categoria == t.categoria_modelo}
        for t in itens
    ]
