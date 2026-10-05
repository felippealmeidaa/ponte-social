"""Gravação e consulta de triagens — usado pela rota web e pelo bot do WhatsApp."""
import uuid
from datetime import timedelta
from typing import Any, Dict, Optional

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import encrypt_secret, mask_phone
from app.models import Conversa, Mensagem, Triagem, agora
from app.services.anonimizacao import anonimizar_texto
from app.services.live_chat.manager import live_chat_manager
from app.services.ml.classifier_service import PRIORIDADE_POR_CATEGORIA, SocialClassifierService
from app.services import catalogo

TENANT_PADRAO = "cras-anapolis-01"
STATUS_VALIDOS = {"PENDENTE", "EM_ATENDIMENTO", "ENCAMINHADO_CREAS", "URGENTE_CREAS", "CONCLUIDO", "ARQUIVADO"}


def para_dict(t: Triagem) -> Dict[str, Any]:
    """Formato consumido pelo painel (mesmos nomes de campo do protótipo anterior)."""
    return {
        "id": t.id,
        "criado_em": t.criado_em.isoformat() if t.criado_em else None,
        "atualizado_em": t.atualizado_em.isoformat() if t.atualizado_em else None,
        "canal": t.canal,
        "nome_cidadao": t.nome_cidadao,
        "telefone_mascarado": t.telefone_mascarado,
        "bairro": t.bairro,
        "cidade": t.cidade,
        "relato_original": t.relato_anonimizado,
        "categoria": t.categoria,
        "categoria_modelo": t.categoria_modelo,
        "categoria_confirmada_pelo_cidadao": t.categoria_confirmada_pelo_cidadao,
        "necessidades_secundarias": t.necessidades_secundarias or [],
        "titulo_encaminhamento": t.titulo_encaminhamento,
        "prioridade": t.prioridade,
        "confianca": t.confianca,
        "metodo_decisao": t.metodo_decisao,
        "status": t.status,
        "observacoes": t.observacoes,
        "conversa_id": t.conversa_id,
        "tem_contato": bool(t.telefone_cifrado),
        "servicos_recomendados": t.servicos_recomendados or [],
        "documentos_necessarios": t.documentos_necessarios or [],
    }


async def criar_triagem(
    session: AsyncSession,
    relato: str,
    classificacao: Dict[str, Any],
    *,
    canal: str,
    telefone: Optional[str] = None,
    nome: Optional[str] = None,
    bairro: Optional[str] = None,
    cidade: Optional[str] = None,
    categoria_final: Optional[str] = None,
    confirmada: bool = False,
    consentiu_treino: bool = False,
    conversa_id: Optional[str] = None,
) -> Triagem:
    """categoria_final: categoria depois da confirmação/correção do cidadão. Se diferente da sugerida,
    os dados de serviço/documentos passam a ser os da categoria corrigida."""
    categoria = categoria_final or classificacao["categoria"]
    info = catalogo.servico(categoria)
    urgente = info["urgencia"]
    triagem = Triagem(
        id=f"trg-{uuid.uuid4().hex[:8]}",
        canal=canal,
        nome_cidadao=(nome or "Não identificado")[:120],
        telefone_mascarado=mask_phone(telefone) if telefone else "Não informado",
        telefone_cifrado=encrypt_secret(telefone) if telefone else "",
        bairro=bairro or "Não informado",
        cidade=cidade or "Anápolis",
        relato_anonimizado=anonimizar_texto(relato),
        categoria=categoria,
        categoria_modelo=classificacao["categoria"],
        categoria_confirmada_pelo_cidadao=confirmada,
        necessidades_secundarias=classificacao.get("necessidades_secundarias", []),
        titulo_encaminhamento=info["titulo"],
        prioridade=_prioridade(categoria),
        confianca=classificacao.get("confianca", 0.0),
        metodo_decisao=classificacao["metodo_decisao"] if categoria == classificacao["categoria"] else "Corrigido pelo cidadão na confirmação",
        servicos_recomendados=info["servicos"],
        documentos_necessarios=info["documentos"],
        status="URGENTE_CREAS" if urgente else "PENDENTE",
        consentiu_uso_para_treino=consentiu_treino,
        conversa_id=conversa_id,
    )
    session.add(triagem)
    await session.commit()
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {"event": "NOVA_TRIAGEM", "data": para_dict(triagem)})
    return triagem


def _prioridade(categoria: str) -> str:
    return PRIORIDADE_POR_CATEGORIA.get(categoria, "BAIXA")


async def listar(session: AsyncSession, status: Optional[str] = None, prioridade: Optional[str] = None,
                 categoria: Optional[str] = None, limite: int = 200):
    # Urgentes primeiro, depois por prioridade; dentro da mesma prioridade, as mais recentes
    ordem_prioridade = case({"URGENTE_VIOLENCIA": 0, "ALTA": 1, "MEDIA": 2}, value=Triagem.prioridade, else_=3)
    q = select(Triagem).order_by(ordem_prioridade, Triagem.criado_em.desc()).limit(limite)
    if status:
        q = q.where(Triagem.status == status)
    if prioridade:
        q = q.where(Triagem.prioridade == prioridade)
    if categoria:
        q = q.where(Triagem.categoria == categoria)
    return (await session.execute(q)).scalars().all()


async def aplicar_retencao(session: AsyncSession) -> int:
    """Apaga triagens mais antigas que RETENCAO_DIAS (LGPD: prazo de retenção definido)."""
    limite = agora() - timedelta(days=settings.RETENCAO_DIAS)
    res = await session.execute(delete(Triagem).where(Triagem.criado_em < limite))
    await session.execute(delete(Mensagem).where(Mensagem.criado_em < limite))
    await session.execute(delete(Conversa).where(Conversa.atualizado_em < limite))
    await session.commit()
    return res.rowcount or 0


async def popular_demo_se_vazio(session: AsyncSession) -> None:
    """Exemplos fictícios para a fila não abrir vazia numa demonstração (canal 'demo')."""
    total = (await session.execute(select(func.count()).select_from(Triagem))).scalar_one()
    if total:
        return
    exemplos = [
        ("Perdi meu emprego e estou sem conseguir colocar comida na mesa para meus 3 filhos.", "Vila Jaiara"),
        ("Preciso atualizar os dados da minha família no Cadastro Único para não bloquear meu benefício.", "Jundiaí"),
        ("Meu ex-marido me ameaçou e quebrou as coisas em casa, preciso de um lugar seguro.", "Recanto do Sol"),
    ]
    for relato, bairro in exemplos:
        await criar_triagem(session, relato, SocialClassifierService.classify_relato(relato),
                            canal="demo", nome="Exemplo fictício", bairro=bairro)
