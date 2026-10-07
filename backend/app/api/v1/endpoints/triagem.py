from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import escopo, pode_ver, usuario_logado
from app.core.security import decrypt_secret
from app.db import get_session
from app.models import Conversa, DocumentoAnexo, Mensagem, Triagem, UnidadeAtendimento, iso, local
from app.services import unidades
from app.models import FUSO_LOCAL
from app.services import agenda, catalogo, documentos, mapa_demanda, relatorio
from app.services.avisos import avisar_andamento
from app.services.channels.envio import enviar_pelo_canal
from app.services.llm.traducao import traduzir
from app.services.llm.resumo import resumir
from app.services.live_chat.manager import live_chat_manager
from app.services.ml.classifier_service import PRIORIDADE_POR_CATEGORIA, SocialClassifierService
from app.services.ml.train_evaluator import CATEGORIAS, VIOLENCIA
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
    # Avisar a pessoa pelo WhatsApp (em atendimento / concluído). Violência nunca é avisada.
    avisar: bool = True


@router.post("/predizer")
async def predizer_relato(payload: TriagemRequest):
    """Classifica o relato sem salvar (simulador do painel)."""
    return SocialClassifierService.classify_relato(payload.relato)


@router.post("/submeter")
async def submeter_triagem(payload: TriagemRequest, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Classifica o relato e coloca na fila (entrada pelo painel/web). Conta de um CRAS registra na própria
    unidade; a coordenação geral, no CRAS do bairro informado (se houver)."""
    classificacao = SocialClassifierService.classify_relato(payload.relato)
    unidade_id = escopo(usuario)
    if not unidade_id and payload.bairro:
        unidade = await unidades.cras_do_bairro(session, payload.bairro)
        unidade_id = unidade.id if unidade else None
    triagem = await criar_triagem(
        session, payload.relato, classificacao, canal=payload.canal,
        telefone=payload.telefone, nome=payload.nome, bairro=payload.bairro, cidade=payload.cidade,
        unidade_id=unidade_id,
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
    usuario: Dict[str, Any] = Depends(usuario_logado),
    session: AsyncSession = Depends(get_session),
):
    """Fila de triagens: só as da unidade da conta (coordenação geral vê todas)."""
    itens = await listar(session, status_filter, prioridade_filter, categoria_filter, unidade=escopo(usuario))
    return [para_dict(t) for t in itens]


@router.patch("/{triagem_id}/status")
async def atualizar_status_triagem(triagem_id: str, payload: UpdateStatusRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                                  session: AsyncSession = Depends(get_session)):
    if payload.status not in STATUS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Status inválido. Use um de: {sorted(STATUS_VALIDOS)}")
    triagem = await session.get(Triagem, triagem_id)
    if triagem is None or not pode_ver(usuario, triagem.unidade_id):
        raise HTTPException(status_code=404, detail="Triagem não encontrada")
    mudou = triagem.status != payload.status
    triagem.status = payload.status
    triagem.atualizado_em = datetime.now(timezone.utc)
    if payload.status in ATENDIDO and not triagem.atendido_em:
        triagem.atendido_em = triagem.atualizado_em  # primeira resposta da equipe (tempo de resposta)
    if payload.observacoes is not None:
        triagem.observacoes = payload.observacoes.strip() or None
    await session.commit()
    aviso = await avisar_andamento(session, triagem, payload.status) if mudou and payload.avisar else None
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {
        "event": "STATUS_ATUALIZADO", "triagem_id": triagem_id, "novo_status": payload.status,
    })
    return {"message": "Status atualizado com sucesso", "triagem": para_dict(triagem), "aviso": aviso}


ATENDIDO = {"EM_ATENDIMENTO", "ENCAMINHADO_CREAS", "CONCLUIDO"}


async def _triagem_ou_404(session: AsyncSession, triagem_id: str, usuario: Dict[str, Any]) -> Triagem:
    triagem = await session.get(Triagem, triagem_id)
    if triagem is None or not pode_ver(usuario, triagem.unidade_id):
        raise HTTPException(status_code=404, detail="Triagem não encontrada")
    return triagem


class AssumirRequest(BaseModel):
    soltar: bool = False
    avisar: bool = True


@router.post("/{triagem_id}/assumir")
async def assumir_caso(triagem_id: str, payload: AssumirRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                       session: AsyncSession = Depends(get_session)):
    """Deixa claro quem está cuidando do caso. Assumir um caso aberto já o põe "Em atendimento" (e avisa a pessoa)."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    aviso = None
    if payload.soltar:
        triagem.responsavel = triagem.responsavel_nome = None
    else:
        triagem.responsavel, triagem.responsavel_nome = usuario.get("sub"), usuario.get("nome")
        if triagem.status in {"PENDENTE", "URGENTE_CREAS"}:
            triagem.status = "EM_ATENDIMENTO"
            triagem.atendido_em = triagem.atendido_em or datetime.now(timezone.utc)
            await session.commit()
            aviso = await avisar_andamento(session, triagem, "EM_ATENDIMENTO") if payload.avisar else None
    triagem.atualizado_em = datetime.now(timezone.utc)
    await session.commit()
    await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {"event": "STATUS_ATUALIZADO", "triagem_id": triagem_id,
                                                                "novo_status": triagem.status})
    return {"triagem": para_dict(triagem), "aviso": aviso}


class AgendamentoRequest(BaseModel):
    quando: datetime = Field(description="Dia e hora; sem fuso, vale o horário de Brasília")
    local: Optional[str] = Field(default=None, max_length=160)
    avisar: bool = True


@router.post("/{triagem_id}/agendamento")
async def marcar_atendimento(triagem_id: str, payload: AgendamentoRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                             session: AsyncSession = Depends(get_session)):
    """Marca (ou remarca) o atendimento. A pessoa recebe a confirmação e, se for com antecedência, o lembrete na véspera."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    quando = payload.quando if payload.quando.tzinfo else payload.quando.replace(tzinfo=FUSO_LOCAL)
    if quando < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="Escolha um dia e hora que ainda não passaram.")
    r = await agenda.marcar(session, triagem, quando.astimezone(timezone.utc), payload.local,
                            usuario.get("nome") or usuario.get("sub", ""), payload.avisar)
    return {"triagem": para_dict(triagem), **r}


@router.delete("/{triagem_id}/agendamento")
async def desmarcar_atendimento(triagem_id: str, avisar: bool = True, usuario: Dict[str, Any] = Depends(usuario_logado),
                                session: AsyncSession = Depends(get_session)):
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    r = await agenda.desmarcar(session, triagem, avisar)
    return {"triagem": para_dict(triagem), **r}


class CategoriaRequest(BaseModel):
    categoria: str


@router.patch("/{triagem_id}/categoria")
async def corrigir_categoria(triagem_id: str, payload: CategoriaRequest, usuario: Dict[str, Any] = Depends(usuario_logado),
                             session: AsyncSession = Depends(get_session)):
    """A equipe corrige a necessidade quando o bot errou. O caminho (serviços, documentos, prioridade) passa a ser
    o da necessidade certa, a sugestão original fica guardada e o caso vira exemplo de treino."""
    if payload.categoria not in CATEGORIAS:
        raise HTTPException(status_code=422, detail="Necessidade inválida.")
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    if payload.categoria != triagem.categoria:
        info = catalogo.servico(payload.categoria, triagem.unidade_id)
        triagem.categoria = payload.categoria
        triagem.titulo_encaminhamento = info["titulo"]
        triagem.servicos_recomendados, triagem.documentos_necessarios = info["servicos"], info["documentos"]
        triagem.prioridade = PRIORIDADE_POR_CATEGORIA.get(payload.categoria, "BAIXA")
        if payload.categoria == VIOLENCIA and triagem.status == "PENDENTE":
            triagem.status = "URGENTE_CREAS"
        elif payload.categoria != VIOLENCIA and triagem.status == "URGENTE_CREAS":
            triagem.status = "PENDENTE"
        triagem.corrigida_por, triagem.corrigida_em = usuario.get("nome") or usuario.get("sub"), datetime.now(timezone.utc)
        triagem.atualizado_em = triagem.corrigida_em
        await session.commit()
        await live_chat_manager.broadcast_to_tenant(TENANT_PADRAO, {"event": "STATUS_ATUALIZADO", "triagem_id": triagem_id,
                                                                    "novo_status": triagem.status})
    return {"triagem": para_dict(triagem)}


@router.get("/{triagem_id}/historico")
async def historico_da_pessoa(triagem_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                              session: AsyncSession = Depends(get_session)):
    """Outros pedidos do mesmo número (pela chave da conversa, sem mostrar o número), do mais novo ao mais antigo."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    if not triagem.conversa_id:
        return []
    outros = (await session.execute(
        select(Triagem).where(Triagem.conversa_id == triagem.conversa_id, Triagem.id != triagem.id).order_by(Triagem.criado_em.desc())
    )).scalars().all()
    return [{"id": t.id, "criado_em": iso(t.criado_em), "categoria": t.categoria, "status": t.status, "avaliacao": t.avaliacao}
            for t in outros if pode_ver(usuario, t.unidade_id)]


@router.get("/{triagem_id}/resumo-ia")
async def resumo_do_caso(triagem_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                         session: AsyncSession = Depends(get_session)):
    """Resumo da conversa feito pela IA (gerado uma vez e guardado). None sem IA."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    if triagem.resumo_ia:
        return {"resumo": triagem.resumo_ia}
    linhas: List[str] = []
    if triagem.conversa_id:
        mensagens = (await session.execute(
            select(Mensagem).where(Mensagem.conversa_id == triagem.conversa_id, Mensagem.criado_em <= (triagem.atualizado_em or datetime.now(timezone.utc)) + timedelta(days=1))
            .order_by(Mensagem.id).limit(80)
        )).scalars().all()
        quem = {"cidadao": "Pessoa", "bot": "Bot", "atendente": "Equipe"}
        linhas = [f"{quem.get(m.autor, m.autor)}: {m.traducao or m.texto}" for m in mensagens]
    if not linhas:
        linhas = [f"Pessoa: {triagem.relato_traducao or triagem.relato_anonimizado}"]
    resumo = await resumir(linhas)
    if resumo:
        triagem.resumo_ia = resumo
        await session.commit()
    return {"resumo": resumo}


@router.get("/{triagem_id}/documentos")
async def documentos_do_caso(triagem_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                             session: AsyncSession = Depends(get_session)):
    """Lista das fotos que a pessoa mandou (sem o conteúdo)."""
    await _triagem_ou_404(session, triagem_id, usuario)
    return [documentos.para_dict(d) for d in await documentos.listar(session, triagem_id)]


@router.get("/{triagem_id}/documentos/{documento_id}/arquivo")
async def arquivo_do_documento(triagem_id: str, documento_id: str, usuario: Dict[str, Any] = Depends(usuario_logado),
                               session: AsyncSession = Depends(get_session)):
    """A foto em si, decifrada só para quem vê o caso. Quem abriu fica registrado nas observações (uma vez por dia)."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    doc = await session.get(DocumentoAnexo, documento_id)
    if doc is None or doc.triagem_id != triagem.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    registro = f"[{local():%d/%m/%Y}] Documentos vistos por {usuario.get('nome') or usuario.get('sub')}."
    if registro not in (triagem.observacoes or ""):
        triagem.observacoes = f"{triagem.observacoes}\n{registro}" if triagem.observacoes else registro
        await session.commit()
    return Response(content=documentos.abrir(doc), media_type=doc.mime,
                    headers={"Cache-Control": "no-store", "Content-Disposition": "inline"})


class RevisaoRequest(BaseModel):
    situacao: Literal["legivel", "refazer"]
    motivo: Optional[str] = Field(default=None, max_length=200)


@router.post("/{triagem_id}/documentos/{documento_id}/revisao")
async def revisar_documento(triagem_id: str, documento_id: str, payload: RevisaoRequest,
                            usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """A equipe marca a foto como legível ou pede outra pelo WhatsApp (com o motivo)."""
    triagem = await _triagem_ou_404(session, triagem_id, usuario)
    doc = await session.get(DocumentoAnexo, documento_id)
    if doc is None or doc.triagem_id != triagem.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if payload.situacao == "refazer" and not (payload.motivo or "").strip():
        raise HTTPException(status_code=422, detail="Diga o que precisa ser corrigido na foto.")
    doc.situacao, doc.motivo, doc.revisado_por = payload.situacao, (payload.motivo or "").strip() or None, usuario.get("nome")
    pedido_enviado = None
    if payload.situacao == "refazer":
        conversa = await session.get(Conversa, triagem.conversa_id) if triagem.conversa_id else None
        pedido_enviado = False
        if conversa is not None:
            texto = catalogo.texto("documento_refazer", triagem.unidade_id).replace("{motivo}", doc.motivo)
            enviado = (await traduzir([texto], "es"))[0] if conversa.idioma == "es" else texto
            if await enviar_pelo_canal(conversa, enviado):
                session.add(Mensagem(conversa_id=conversa.telefone_hash, autor="bot", texto=enviado,
                                     traducao=texto if texto != enviado else None))
                conversa.estado, conversa.documentos_triagem = "AGUARDANDO_DOCUMENTOS", triagem.id
                pedido_enviado = True
    await session.commit()
    return {"documento": documentos.para_dict(doc), "pedido_enviado": pedido_enviado}


@router.get("/exemplos-rotulados")
async def exportar_exemplos_rotulados(usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Relatos (já anonimizados) cuja categoria o próprio cidadão confirmou ou corrigiu no WhatsApp,
    com consentimento. São candidatos a novos exemplos de treino — revisar antes de usar."""
    q = select(Triagem).where(Triagem.categoria_confirmada_pelo_cidadao.is_(True), Triagem.consentiu_uso_para_treino.is_(True))
    if escopo(usuario):
        q = q.where(Triagem.unidade_id == escopo(usuario))
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
    if triagem is None or not pode_ver(usuario, triagem.unidade_id):
        raise HTTPException(status_code=404, detail="Triagem não encontrada")
    telefone = decrypt_secret(triagem.telefone_cifrado)
    if not telefone:
        raise HTTPException(status_code=404, detail="Esta triagem não tem telefone de contato")
    registro = f"[{local():%d/%m/%Y %H:%M}] telefone consultado por {usuario.get('sub')}"
    triagem.observacoes = f"{triagem.observacoes}\n{registro}" if triagem.observacoes else registro
    await session.commit()
    return {"telefone": telefone}


@router.get("/indicadores/resumo")
async def indicadores(dias: int = 30, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Números da fila e indicadores de impacto propostos no plano (seção 10). Ignora os exemplos de demonstração."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    consulta = select(Triagem).where(Triagem.criado_em >= desde, Triagem.canal != "demo")
    if escopo(usuario):
        consulta = consulta.where(Triagem.unidade_id == escopo(usuario))
    itens = (await session.execute(consulta)).scalars().all()
    # Dia no horário de Brasília: um caso das 22h conta no dia em que chegou, não no seguinte (UTC)
    por_dia = Counter(local(t.criado_em).date().isoformat() for t in itens)
    confirmadas = [t for t in itens if t.categoria_confirmada_pelo_cidadao]
    atendidas = [t for t in itens if t.atualizado_em and t.status in {"EM_ATENDIMENTO", "CONCLUIDO", "ENCAMINHADO_CREAS"}]
    horas = [(t.atualizado_em.replace(tzinfo=timezone.utc) - t.criado_em.replace(tzinfo=timezone.utc)).total_seconds() / 3600
             for t in atendidas]
    hoje = local().date()
    dias_lista = [(hoje - timedelta(days=dias - 1 - i)).isoformat() for i in range(dias)]
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
        "tempo_resposta": await relatorio.tempo_resposta(session, itens),
        "avaliacao": {
            "respostas": len(notas := [t.avaliacao for t in itens if t.avaliacao]),
            "media": round(sum(notas) / len(notas), 1) if notas else None,
            "por_nota": {str(n): notas.count(n) for n in range(1, 6)},
        },
    }


@router.get("/relatorio")
async def relatorio_do_mes(mes: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                           session: AsyncSession = Depends(get_session)):
    """Relatório de um mês ("2026-09"; sem mês, o mês corrente) para ver na tela e imprimir/salvar em PDF."""
    return await relatorio.montar(session, *_mes_ou_422(mes), escopo(usuario))


@router.get("/relatorio.xlsx")
async def relatorio_planilha(mes: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                             session: AsyncSession = Depends(get_session)):
    """O mesmo relatório como planilha, uma aba por assunto."""
    dados = await relatorio.montar(session, *_mes_ou_422(mes), escopo(usuario))
    return Response(relatorio.planilha(dados), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{relatorio.nome_arquivo(dados)}"'})


def _mes_ou_422(mes: Optional[str]) -> tuple:
    try:
        return relatorio.mes_valido(mes)
    except ValueError:
        raise HTTPException(status_code=422, detail="Mês inválido. Use o formato 2026-09.")


@router.get("/indicadores/mapa")
async def mapa_de_demandas(dias: int = 30, usuario: Dict[str, Any] = Depends(usuario_logado), session: AsyncSession = Depends(get_session)):
    """Casos do período agrupados por bairro, com um ponto por bairro (nunca por pessoa). Ignora os exemplos de demonstração."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    consulta = select(Triagem).where(Triagem.criado_em >= desde, Triagem.canal != "demo")
    if escopo(usuario):
        consulta = consulta.where(Triagem.unidade_id == escopo(usuario))
    itens = (await session.execute(consulta)).scalars().all()
    return {"periodo_dias": dias, **await mapa_demanda.montar(session, itens, escopo(usuario))}
