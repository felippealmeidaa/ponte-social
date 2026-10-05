from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import usuario_logado
from app.core.security import decrypt_secret
from app.db import get_session
from app.models import Triagem
from app.services.live_chat.manager import live_chat_manager
from app.services.ml.classifier_service import SocialClassifierService
from app.services.triagens import STATUS_VALIDOS, TENANT_PADRAO, criar_triagem, listar, para_dict

router = APIRouter(dependencies=[Depends(usuario_logado)])


class TriagemRequest(BaseModel):
    relato: str = Field(min_length=1, max_length=4000)
    nome: Optional[str] = None
    telefone: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = "Anápolis"
    # "presencial": registrado por um profissional durante atendimento no balcão
    canal: Literal["web", "presencial"] = "web"


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
        session, payload.relato, classificacao, canal=payload.canal,
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
    if payload.observacoes is not None:
        triagem.observacoes = payload.observacoes.strip() or None
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


@router.get("/{triagem_id}/contato")
async def ver_contato(triagem_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                      session: AsyncSession = Depends(get_session)):
    """Telefone completo para o CRAS retornar o contato. Fica registrado quem consultou."""
    triagem = await session.get(Triagem, triagem_id)
    if triagem is None:
        raise HTTPException(status_code=404, detail="Triagem não encontrada")
    telefone = decrypt_secret(triagem.telefone_cifrado)
    if not telefone:
        raise HTTPException(status_code=404, detail="Esta triagem não tem telefone de contato")
    registro = f"[{datetime.now(timezone.utc):%d/%m/%Y %H:%M} UTC] telefone consultado por {usuario.get('sub')}"
    triagem.observacoes = f"{triagem.observacoes}\n{registro}" if triagem.observacoes else registro
    await session.commit()
    return {"telefone": telefone}


@router.get("/indicadores/resumo")
async def indicadores(dias: int = 30, session: AsyncSession = Depends(get_session)):
    """Números da fila e indicadores de impacto propostos no plano (seção 10). Ignora os exemplos de demonstração."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    itens = (await session.execute(select(Triagem).where(Triagem.criado_em >= desde, Triagem.canal != "demo"))).scalars().all()
    por_dia = Counter(t.criado_em.date().isoformat() for t in itens)
    confirmadas = [t for t in itens if t.categoria_confirmada_pelo_cidadao]
    atendidas = [t for t in itens if t.atualizado_em and t.status in {"EM_ATENDIMENTO", "CONCLUIDO", "ENCAMINHADO_CREAS"}]
    horas = [(t.atualizado_em.replace(tzinfo=timezone.utc) - t.criado_em.replace(tzinfo=timezone.utc)).total_seconds() / 3600
             for t in atendidas]
    dias_lista = [(desde + timedelta(days=i + 1)).date().isoformat() for i in range(dias)]
    return {
        "periodo_dias": dias,
        "total": len(itens),
        "abertas": sum(t.status in {"PENDENTE", "URGENTE_CREAS"} for t in itens),
        "urgentes": sum(t.prioridade == "URGENTE_VIOLENCIA" for t in itens),
        "por_status": dict(Counter(t.status for t in itens)),
        "por_categoria": dict(Counter(t.categoria for t in itens).most_common()),
        "por_canal": dict(Counter(t.canal for t in itens)),
        "por_bairro": dict(Counter(t.bairro for t in itens if t.bairro and t.bairro != "Não informado").most_common(8)),
        "por_dia": [{"dia": d, "total": por_dia.get(d, 0)} for d in dias_lista],
        "acerto_do_sistema": {
            "confirmadas_pelo_cidadao": len(confirmadas),
            "sugestao_aceita": sum(t.categoria == t.categoria_modelo for t in confirmadas),
        },
        "horas_ate_primeiro_atendimento": round(sum(horas) / len(horas), 1) if horas else None,
    }
