from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, Float, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def agora() -> datetime:
    return datetime.now(timezone.utc)


# Horário de Brasília (Anápolis): o banco guarda em UTC; dias e horas mostrados às pessoas usam este fuso
FUSO_LOCAL = timezone(timedelta(hours=-3), "Brasília")


def local(dt: Optional[datetime] = None) -> datetime:
    """Data e hora no horário de Brasília (agora, se não vier nenhuma)."""
    dt = dt or agora()
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).astimezone(FUSO_LOCAL)


def iso(dt: Optional[datetime]) -> Optional[str]:
    """Data e hora para o painel, sempre com o fuso. O SQLite devolve sem fuso o que foi gravado em UTC;
    sem o "+00:00", o navegador lê como hora local e tudo fica 3 horas adiantado."""
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


class Triagem(Base):
    """Uma triagem na fila do CRAS. Guarda só o necessário (plano, seção 10):
    relato anonimizado, categoria, prioridade e status; telefone mascarado + criptografado."""
    __tablename__ = "triagens"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    canal: Mapped[str] = mapped_column(String(20), default="web")  # whatsapp | web | demo

    nome_cidadao: Mapped[str] = mapped_column(String(120), default="Não identificado")
    telefone_mascarado: Mapped[str] = mapped_column(String(32), default="Não informado")
    telefone_cifrado: Mapped[str] = mapped_column(Text, default="")  # Fernet; só para o CRAS retornar o contato
    bairro: Mapped[str] = mapped_column(String(80), default="Não informado")
    cidade: Mapped[str] = mapped_column(String(80), default="Anápolis")

    relato_anonimizado: Mapped[str] = mapped_column(Text)
    categoria: Mapped[str] = mapped_column(String(40), index=True)
    categoria_modelo: Mapped[str] = mapped_column(String(40))  # o que o sistema sugeriu antes de qualquer correção
    categoria_confirmada_pelo_cidadao: Mapped[bool] = mapped_column(default=False)
    necessidades_secundarias: Mapped[list] = mapped_column(JSON, default=list)
    titulo_encaminhamento: Mapped[str] = mapped_column(String(160))
    prioridade: Mapped[str] = mapped_column(String(30), index=True)
    confianca: Mapped[float] = mapped_column(Float, default=0.0)
    metodo_decisao: Mapped[str] = mapped_column(String(120))
    servicos_recomendados: Mapped[list] = mapped_column(JSON, default=list)
    documentos_necessarios: Mapped[list] = mapped_column(JSON, default=list)

    conversa_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # CRAS responsável (pelo bairro da pessoa). None = sem unidade definida: fica com a coordenação geral
    unidade_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="PENDENTE", index=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consentiu_uso_para_treino: Mapped[bool] = mapped_column(default=False)

    # Relato em outro idioma (ex.: espanhol): o relato fica como a pessoa escreveu e a equipe lê a tradução
    idioma: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    relato_traducao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Quem da equipe assumiu o caso e quando ele foi atendido pela primeira vez (tempo de resposta)
    responsavel: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    responsavel_nome: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atendido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Nota de 1 a 5 que a pessoa deu pelo WhatsApp depois de concluído
    avaliacao: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Resumo da conversa feito pela IA para a ficha (gerado na primeira vez que alguém abre)
    resumo_ia: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Correção da necessidade pela equipe (vira exemplo de treino; a sugestão original fica em categoria_modelo)
    corrigida_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    corrigida_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Atendimento marcado pela equipe: a pessoa recebe a confirmação e um lembrete na véspera (services/agenda.py)
    agendado_para: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    agendado_local: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    agendado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    agendado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    lembrete_enviado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Fotos de documentos que a pessoa mandou pelo WhatsApp para adiantar a análise (ver DocumentoAnexo)
    documentos_enviados: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class DocumentoAnexo(Base):
    """Foto (ou PDF) de documento mandada pela pessoa para a equipe do CRAS analisar antes do atendimento.
    Dado pessoal sensível: o arquivo fica cifrado (Fernet), nunca vai para a IA, só a equipe do caso abre
    (cada abertura fica registrada) e é apagado DOCUMENTOS_RETENCAO_DIAS depois de o caso ser fechado."""
    __tablename__ = "documentos_anexos"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    triagem_id: Mapped[str] = mapped_column(String(16), index=True)
    conversa_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    mime: Mapped[str] = mapped_column(String(60))
    tamanho: Mapped[int] = mapped_column(Integer)
    largura: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    altura: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    conteudo_cifrado: Mapped[bytes] = mapped_column(LargeBinary)
    # Revisão da equipe: None (a ver) | "legivel" | "refazer"
    situacao: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    revisado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class Conversa(Base):
    """Estado da conversa de cada contato no WhatsApp (ver services/bot/fluxo_conversa.py).
    A chave é um hash do telefone, não o número; o número fica só criptografado, para responder."""
    __tablename__ = "conversas"

    telefone_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    telefone_cifrado: Mapped[str] = mapped_column(Text, default="")
    telefone_mascarado: Mapped[str] = mapped_column(String(32), default="")
    canal: Mapped[str] = mapped_column(String(20), default="evolution")  # evolution | meta | simulador
    estado: Mapped[str] = mapped_column(String(40))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)
    tentativas: Mapped[int] = mapped_column(Integer, default=0)
    # Quando a pessoa aceitou o uso das informações; quem já aceitou não é perguntado de novo
    consentiu_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    relato: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # já anonimizado
    bairro: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # para indicar o CRAS de referência
    unidade_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)  # CRAS do bairro; define o fluxo
    # Ponto aproximado da pessoa (pino do WhatsApp ou centro do bairro), arredondado a ~100 m: só para achar o lugar mais perto
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    categoria_sugerida: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    categoria_escolhida: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    classificacao: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Atendimento humano: com um atendente na conversa, o bot fica em silêncio
    atendimento_humano: Mapped[bool] = mapped_column(default=False)
    atendente: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    # "es" quando a pessoa escreve em espanhol: o bot responde traduzido e a equipe lê em português
    idioma: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    # Retorno dias depois para quem não quis contato: {"em", "categoria", "relato", "classificacao", "enviado"}
    acompanhamento: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Triagem concluída esperando a nota de 1 a 5
    avaliando_triagem: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # Última resposta do bot (em português): é o que vai em áudio ou explicado de novo quando a pessoa não entende
    ultima_resposta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # "Não entendi": a etapa em que a conversa estava, para voltar a ela depois da ajuda
    ajuda: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Pedido que está recebendo as fotos dos documentos
    documentos_triagem: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    nao_lidas: Mapped[int] = mapped_column(Integer, default=0)


class Mensagem(Base):
    """Histórico da conversa para o atendimento humano. Mensagens do cidadão são gravadas anonimizadas."""
    __tablename__ = "mensagens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversa_id: Mapped[str] = mapped_column(String(64), index=True)
    autor: Mapped[str] = mapped_column(String(20))  # cidadao | bot | atendente
    texto: Mapped[str] = mapped_column(Text)
    # Em conversa noutro idioma: o texto em português (o que a pessoa escreveu traduzido, ou o original do bot/atendente)
    traducao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora, index=True)


class ServicoCategoria(Base):
    """Base de serviços editável pelo CRAS: o que o bot responde para cada categoria."""
    __tablename__ = "servicos_categoria"

    categoria: Mapped[str] = mapped_column(String(40), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(160))
    servicos: Mapped[list] = mapped_column(JSON, default=list)
    documentos: Mapped[list] = mapped_column(JSON, default=list)
    local_atendimento: Mapped[str] = mapped_column(Text)
    contato_util: Mapped[str] = mapped_column(Text)
    # Rastreabilidade (plano, seção 9): de onde veio a regra e quando alguém conferiu
    fonte: Mapped[str] = mapped_column(Text, default="")
    verificado_em: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class TextoBot(Base):
    """Textos da conversa do bot editáveis pelo CRAS."""
    __tablename__ = "textos_bot"

    chave: Mapped[str] = mapped_column(String(40), primary_key=True)
    texto: Mapped[str] = mapped_column(Text)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class Usuario(Base):
    """Conta de acesso ao painel. Coordenação (ADMIN) gerencia a equipe; atendimento (ATENDENTE) opera a fila."""
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    login: Mapped[str] = mapped_column(String(60), unique=True, index=True)  # sempre minúsculo
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), default="")
    senha_hash: Mapped[str] = mapped_column(Text)
    papel: Mapped[str] = mapped_column(String(20), default="ATENDENTE")
    # Unidade da conta: vê e edita só o que é dela. None = coordenação geral (secretaria), vê tudo
    unidade_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    ativo: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    ultimo_acesso: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class UnidadeAtendimento(Base):
    """Lugares da rede do município (CRAS, CREAS, Centro POP, restaurante popular, Vapt Vupt, SINE...), com os
    bairros que cada um atende, as necessidades que atende e o ponto no mapa. Deve ser conferida com a prefeitura."""
    __tablename__ = "unidades_atendimento"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    nome: Mapped[str] = mapped_column(String(160))
    tipo: Mapped[str] = mapped_column(String(20), default="CRAS")  # ver unidades.TIPOS
    endereco: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Necessidades (categorias do catálogo) que o lugar atende; vazio = o padrão do tipo
    categorias: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    telefone: Mapped[str] = mapped_column(String(80), default="")
    horario: Mapped[str] = mapped_column(String(160), default="")
    bairros: Mapped[list] = mapped_column(JSON, default=list)
    fonte: Mapped[str] = mapped_column(Text, default="")
    verificado_em: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class ServicoUnidade(Base):
    """Resposta por necessidade personalizada por um CRAS. Sem linha aqui, vale o padrão da secretaria."""
    __tablename__ = "servicos_unidade"

    unidade_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    categoria: Mapped[str] = mapped_column(String(40), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(160))
    servicos: Mapped[list] = mapped_column(JSON, default=list)
    documentos: Mapped[list] = mapped_column(JSON, default=list)
    local_atendimento: Mapped[str] = mapped_column(Text)
    contato_util: Mapped[str] = mapped_column(Text)
    fonte: Mapped[str] = mapped_column(Text, default="")
    verificado_em: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class RespostaPronta(Base):
    """Modelo de mensagem que o atendente usa com um clique em Conversas. unidade_id None = da secretaria
    (todos veem); com unidade, só aquele CRAS vê. A coordenação edita."""
    __tablename__ = "respostas_prontas"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    unidade_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    titulo: Mapped[str] = mapped_column(String(80))
    texto: Mapped[str] = mapped_column(Text)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class TextoUnidade(Base):
    """Texto do bot personalizado por um CRAS. Sem linha aqui, vale o padrão da secretaria."""
    __tablename__ = "textos_unidade"

    unidade_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    chave: Mapped[str] = mapped_column(String(40), primary_key=True)
    texto: Mapped[str] = mapped_column(Text)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class DesenhoFluxo(Base):
    """Fluxo no painel: posição de cada quadradinho e mensagens extras que o bot envia.
    unidade_id = "padrao" para a secretaria; ou o id de um CRAS. Campo None = usa o da secretaria."""
    __tablename__ = "desenho_fluxo"

    unidade_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    posicoes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {id: {"x": .., "y": ..}}
    extras: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)    # [{id, antes_de, titulo, texto}]
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class OpcoesFluxo(Base):
    """Opções do fluxo do bot. unidade_id = "padrao" para a secretaria; ou o id de um CRAS."""
    __tablename__ = "opcoes_fluxo"

    unidade_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    opcoes: Mapped[dict] = mapped_column(JSON, default=dict)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class ExemploTreino(Base):
    """Exemplo de treino escrito pela equipe (Configurações › Dados de treino): uma frase e a necessidade certa.
    Entra no retreino junto com os relatos simulados e os casos reais confirmados; nunca entra no teste fixo."""
    __tablename__ = "exemplos_treino"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    texto: Mapped[str] = mapped_column(Text)  # já anonimizado
    categoria: Mapped[str] = mapped_column(String(40), index=True)
    origem: Mapped[str] = mapped_column(String(20), default="manual")  # manual | importacao
    ativo: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    criado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class DocumentoBase(Base):
    """Documento da base de conhecimento (lei, decreto, manual, tabela de critérios). O texto extraído fica guardado
    para comparar com os trechos; o arquivo original não. Ainda não é usado nas respostas do WhatsApp."""
    __tablename__ = "base_documentos"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(200))
    nome_arquivo: Mapped[str] = mapped_column(String(200))
    tipo: Mapped[str] = mapped_column(String(10))  # pdf | docx | txt | md
    fonte: Mapped[str] = mapped_column(Text, default="")  # de onde veio (órgão, link oficial, número da lei)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    versao: Mapped[int] = mapped_column(Integer, default=1)
    texto: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    criado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class TrechoDocumento(Base):
    """Pedaço de um documento, cortado respeitando títulos, listas e tabelas. O vetor serve à busca por significado."""
    __tablename__ = "base_trechos"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    documento_id: Mapped[str] = mapped_column(String(16), index=True)
    indice: Mapped[int] = mapped_column(Integer)
    conteudo: Mapped[str] = mapped_column(Text)
    secao: Mapped[str] = mapped_column(String(200), default="")
    pagina: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    editado_manualmente: Mapped[bool] = mapped_column(default=False)
    embedding: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    modelo_embedding: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class AgentePersonalizado(Base):
    """Agente criado pela coordenação (Configurações › Agentes): instruções, temperatura e as ferramentas de consulta
    que ele pode usar. Roda só no teste do painel; não responde no WhatsApp e nunca passa por cima da regra de violência."""
    __tablename__ = "agentes"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80))
    descricao: Mapped[str] = mapped_column(Text, default="")
    instrucoes: Mapped[str] = mapped_column(Text)
    temperatura: Mapped[float] = mapped_column(Float, default=0.2)
    ferramentas: Mapped[list] = mapped_column(JSON, default=list)
    ativo: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    criado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class FluxoPersonalizado(Base):
    """Fluxo montado pela coordenação (Configurações › Fluxos): etapas ligadas sem ciclo. Roda só no simulador do
    painel; o bot do WhatsApp continua com o fluxo fixo do CRAS e a regra de violência vale em toda mensagem."""
    __tablename__ = "fluxos_personalizados"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80))
    descricao: Mapped[str] = mapped_column(Text, default="")
    etapas: Mapped[list] = mapped_column(JSON, default=list)    # [{id, tipo, titulo, ...campos do tipo}]
    ligacoes: Mapped[list] = mapped_column(JSON, default=list)  # [{de, saida, para}]
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    criado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atualizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
