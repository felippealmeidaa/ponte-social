"""Tela "Serviços e mensagens": o CRAS edita o que o bot responde, sem mexer em código.

Toda rota aceita ?unidade=<id>. Conta de um CRAS vê e edita só a própria unidade; a coordenação geral
escolhe a unidade (sem ?unidade = padrão da secretaria). Escrever exige papel de coordenação."""
from datetime import date, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import apenas_coordenacao, apenas_coordenacao_geral, escopo, resolver_unidade, usuario_logado
from app.db import get_session
from app.models import Conversa, Triagem, Usuario, agora
from app.services import catalogo, desenho_fluxo, funcionamento, geo, unidades
from app.services.bot.fluxo_conversa import caminho_completo
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES

router = APIRouter(dependencies=[Depends(usuario_logado)])


class ServicoRequest(BaseModel):
    titulo: str = Field(min_length=3, max_length=160)
    servicos: List[str] = Field(min_length=1)
    documentos: List[str] = Field(min_length=1)
    local_atendimento: str = Field(min_length=3)
    contato_util: str = Field(min_length=3)
    fonte: str = Field(default="", max_length=500, description="Link ou documento oficial de onde veio a regra")
    verificado_em: Optional[date] = Field(default=None, description="Data em que alguém do CRAS conferiu a informação")


class TextoRequest(BaseModel):
    texto: str


def _categoria_valida(categoria: str) -> None:
    if categoria not in KNOWLEDGE_SERVICES:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")


class OpcoesRequest(BaseModel):
    opcoes: Dict[str, Any]


@router.get("/servicos")
async def listar_servicos(unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                          session: AsyncSession = Depends(get_session)):
    return await catalogo.listar_servicos(session, await resolver_unidade(usuario, unidade, session))


@router.put("/servicos/{categoria}")
async def salvar_servico(categoria: str, req: ServicoRequest, unidade: Optional[str] = None,
                         usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    _categoria_valida(categoria)
    alvo = await resolver_unidade(usuario, unidade, session)
    dados = req.model_dump()
    if not [s for s in dados["servicos"] if s.strip()] or not [d for d in dados["documentos"] if d.strip()]:
        raise HTTPException(status_code=422, detail="Informe pelo menos um serviço e um documento.")
    if dados["verificado_em"] and dados["verificado_em"] > date.today():
        raise HTTPException(status_code=422, detail="A data de conferência não pode estar no futuro.")
    return await catalogo.salvar_servico(session, categoria, dados, usuario.get("sub", ""), alvo)


@router.post("/servicos/{categoria}/restaurar")
async def restaurar_servico(categoria: str, unidade: Optional[str] = None,
                            usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    """No CRAS: volta ao padrão da secretaria. Na secretaria: volta ao texto original do sistema."""
    _categoria_valida(categoria)
    alvo = await resolver_unidade(usuario, unidade, session)
    return await catalogo.restaurar_servico(session, categoria, usuario.get("sub", ""), alvo)


@router.get("/servicos/{categoria}/previa")
async def previa_resposta(categoria: str, unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                          session: AsyncSession = Depends(get_session)):
    """Como a resposta do bot aparece no WhatsApp para essa categoria."""
    _categoria_valida(categoria)
    alvo = await resolver_unidade(usuario, unidade, session)
    return {"texto": caminho_completo(categoria, unidade=alvo,
                                      perguntar_contato=catalogo.opcoes_fluxo(alvo)["contato"] == "perguntar")}


@router.get("/textos")
async def listar_textos(unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                        session: AsyncSession = Depends(get_session)):
    return await catalogo.listar_textos(session, await resolver_unidade(usuario, unidade, session))


@router.put("/textos/{chave}")
async def salvar_texto(chave: str, req: TextoRequest, unidade: Optional[str] = None,
                       usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    erro = catalogo.validar_texto(chave, req.texto)
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    alvo = await resolver_unidade(usuario, unidade, session)
    return {"chave": chave, "texto": await catalogo.salvar_texto(session, chave, req.texto, usuario.get("sub", ""), alvo)}


@router.post("/textos/{chave}/restaurar")
async def restaurar_texto(chave: str, unidade: Optional[str] = None,
                          usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    if chave not in catalogo.TEXTOS_PADRAO:
        raise HTTPException(status_code=404, detail="Texto desconhecido.")
    alvo = await resolver_unidade(usuario, unidade, session)
    return {"chave": chave, "texto": await catalogo.restaurar_texto(session, chave, usuario.get("sub", ""), alvo)}


@router.get("/fluxo/opcoes")
async def ler_opcoes_fluxo(unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                           session: AsyncSession = Depends(get_session)):
    return await catalogo.ler_opcoes(session, await resolver_unidade(usuario, unidade, session))


@router.put("/fluxo/opcoes")
async def salvar_opcoes_fluxo(req: OpcoesRequest, unidade: Optional[str] = None,
                              usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    """Liga/desliga etapas opcionais. Violência, aceite, "apagar" e "recomeçar" não são opções: valem sempre."""
    alvo = await resolver_unidade(usuario, unidade, session)
    erro = catalogo.validar_opcoes(req.opcoes, alvo)
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    return await catalogo.salvar_opcoes(session, req.opcoes, usuario.get("sub", ""), alvo)


@router.get("/fluxo/desenho")
async def ler_desenho_fluxo(unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                            session: AsyncSession = Depends(get_session)):
    return await desenho_fluxo.ler(session, await resolver_unidade(usuario, unidade, session))


@router.put("/fluxo/desenho")
async def salvar_desenho_fluxo(req: Dict[str, Any], unidade: Optional[str] = None,
                               usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    """Posições dos quadradinhos e mensagens extras. Campo omitido fica como está; null volta ao da secretaria."""
    alvo = await resolver_unidade(usuario, unidade, session)
    dados = {k: v for k, v in req.items() if k in ("posicoes", "extras")}
    erro = desenho_fluxo.validar(dados.get("posicoes"), dados.get("extras"))
    if erro:
        raise HTTPException(status_code=422, detail=erro)
    return await desenho_fluxo.salvar(session, dados, usuario.get("sub", ""), alvo)


# ------------------------------------------------------------------------------
# Unidades de atendimento (CRAS, CREAS, Centro POP) e os bairros que cada uma atende
# ------------------------------------------------------------------------------
class FaixaHorarioRequest(BaseModel):
    dias: List[int] = Field(default_factory=list)  # 0 = segunda ... 6 = domingo
    abre: str = Field(max_length=5)
    fecha: str = Field(max_length=5)


class UnidadeRequest(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    tipo: Literal["CRAS", "CREAS", "CENTRO_POP", "CADUNICO", "RESTAURANTE_POPULAR", "DOCUMENTOS", "SINE", "OUTRO"] = "CRAS"
    endereco: str = Field(default="", max_length=300)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    categorias: List[str] = Field(default_factory=list)
    telefone: str = Field(default="", max_length=80)
    horario: str = Field(default="", max_length=160)
    funcionamento: List[FaixaHorarioRequest] = Field(default_factory=list)
    bairros: List[str] = Field(default_factory=list)
    fonte: str = Field(default="", max_length=500)
    verificado_em: Optional[date] = None
    ativo: bool = True


@router.get("/unidades")
async def listar_unidades(session: AsyncSession = Depends(get_session)):
    return [unidades.para_dict(u) for u in await unidades.listar(session)]


async def _salvar_unidade(req: UnidadeRequest, usuario: Dict[str, Any], session: AsyncSession, unidade_id: Optional[str] = None):
    if not unidades.data_valida(req.verificado_em):
        raise HTTPException(status_code=422, detail="A data de conferência não pode estar no futuro.")
    if req.tipo == "CRAS" and not [b for b in req.bairros if b.strip()] and not req.endereco.strip() and req.latitude is None:
        raise HTTPException(status_code=422, detail="Informe os bairros atendidos ou o endereço deste CRAS (para achar o mais perto).")
    if (req.latitude is None) != (req.longitude is None):
        raise HTTPException(status_code=422, detail="Preencha latitude e longitude juntas, ou deixe as duas vazias.")
    if req.tipo == "OUTRO" and not req.categorias:
        raise HTTPException(status_code=422, detail="Marque as necessidades que este lugar atende.")
    try:
        funcionamento.validar(req.model_dump()["funcionamento"])
    except funcionamento.FuncionamentoInvalido as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        return unidades.para_dict(await unidades.salvar(session, req.model_dump(), usuario.get("sub", ""), unidade_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/unidades")
async def criar_unidade(req: UnidadeRequest, usuario: Dict[str, Any] = Depends(apenas_coordenacao_geral),
                        session: AsyncSession = Depends(get_session)):
    return await _salvar_unidade(req, usuario, session)


@router.put("/unidades/{unidade_id}")
async def atualizar_unidade(unidade_id: str, req: UnidadeRequest, usuario: Dict[str, Any] = Depends(apenas_coordenacao_geral),
                            session: AsyncSession = Depends(get_session)):
    return await _salvar_unidade(req, usuario, session, unidade_id)


@router.delete("/unidades/{unidade_id}", dependencies=[Depends(apenas_coordenacao_geral)])
async def remover_unidade(unidade_id: str, session: AsyncSession = Depends(get_session)):
    # Remover com contas ou casos ligados deixaria contas "sem unidade" (= coordenação geral) e casos órfãos
    contas = (await session.execute(select(func.count()).select_from(Usuario).where(Usuario.unidade_id == unidade_id))).scalar_one()
    casos = (await session.execute(select(func.count()).select_from(Triagem).where(Triagem.unidade_id == unidade_id))).scalar_one()
    if contas or casos:
        raise HTTPException(status_code=422, detail="Esta unidade tem contas ou casos ligados. Desative-a em vez de remover.")
    try:
        await unidades.remover(session, unidade_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"removida": unidade_id}


@router.get("/unidades/localizar", dependencies=[Depends(apenas_coordenacao_geral)])
async def localizar_endereco(endereco: str):
    """Procura um endereço do município no mapa (OpenStreetMap) para preencher latitude e longitude."""
    ponto = await geo.buscar(endereco)
    if not ponto:
        raise HTTPException(status_code=404, detail="Não achei esse endereço no mapa. Tente só a rua e o bairro, ou cole as coordenadas do Google Maps.")
    return {"latitude": ponto[0], "longitude": ponto[1], "mapa": geo.link_mapa(*ponto)}


@router.get("/unidades/buscar")
async def buscar_por_bairro(bairro: str, session: AsyncSession = Depends(get_session)):
    """Testa qual CRAS o bot indicaria para um bairro: pela lista de bairros ou, sem ela, o mais perto no mapa."""
    if unidade := await unidades.cras_do_bairro(session, bairro):
        return {"bairro": bairro, "unidade": unidades.para_dict(unidade), "como": "lista", "km": None}
    centro = await geo.buscar(bairro)
    unidade = await unidades.cras_mais_perto(session, centro) if centro else None
    km = round(geo.distancia_km(centro, unidades.ponto_da(unidade)), 1) if unidade else None
    return {"bairro": bairro, "unidade": unidades.para_dict(unidade) if unidade else None,
            "como": "distancia" if unidade else None, "km": km}


# ------------------------------------------------------------------------------
# Mapa do fluxo: quantas conversas estão em cada etapa agora
# ------------------------------------------------------------------------------
@router.get("/fluxo/agora")
async def conversas_por_etapa(unidade: Optional[str] = None, usuario: Dict[str, Any] = Depends(usuario_logado),
                              session: AsyncSession = Depends(get_session)):
    """Conversas ativas (mexidas dentro do prazo de expiração) por estado do fluxo, mais as que estão
    com um atendente. Mostra no mapa onde as pessoas estão paradas."""
    limite = agora() - timedelta(minutes=settings.CONVERSA_EXPIRA_MIN)
    consulta = (select(Conversa.estado, Conversa.atendimento_humano, func.count())
                .where(Conversa.atualizado_em >= limite, Conversa.estado != "FINALIZADA")
                .group_by(Conversa.estado, Conversa.atendimento_humano))
    alvo = await resolver_unidade(usuario, unidade, session) if (unidade or escopo(usuario)) else None
    if alvo:
        consulta = consulta.where(Conversa.unidade_id == alvo)
    linhas = (await session.execute(consulta)).all()
    por_estado: Dict[str, int] = {}
    com_atendente = 0
    for estado, humano, total in linhas:
        if humano:
            com_atendente += total
        else:
            por_estado[estado] = por_estado.get(estado, 0) + total
    return {"por_estado": por_estado, "com_atendente": com_atendente, "janela_minutos": settings.CONVERSA_EXPIRA_MIN}
