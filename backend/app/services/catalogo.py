"""
Base de serviços e textos do bot editáveis pelo CRAS (tela "Serviços e mensagens").

Ficam no banco; este módulo mantém uma cópia em memória para leitura rápida (o classificador
e o fluxo da conversa leem daqui) e é recarregado sempre que alguém salva uma alteração.
Os valores padrão vêm de train_evaluator.KNOWLEDGE_SERVICES e de TEXTOS_PADRAO abaixo.
"""
import copy
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ServicoCategoria, TextoBot, agora
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES

TEXTOS_PADRAO: Dict[str, Dict[str, str]] = {
    "boas_vindas": {
        "descricao": "Primeira mensagem: apresentação e pedido de consentimento",
        "texto": (
            "Olá! Sou o assistente de orientação da Assistência Social de Anápolis. 👋\n\n"
            "Eu ajudo a descobrir *qual serviço procurar, quais documentos levar e onde ir*. "
            "Sou só uma orientação: *não decido quem tem direito a benefício* — isso é feito pelos profissionais do CRAS.\n\n"
            "Vou usar o que você me contar para te orientar e, *sem identificar você*, para melhorar este serviço. "
            "Não escreva nome, CPF ou endereço. A qualquer momento, envie *apagar* para excluir seus dados.\n\n"
            "Você concorda?\n*1* - Sim, concordo\n*2* - Não"
        ),
    },
    "pedir_relato": {
        "descricao": "Depois do consentimento: pede para a pessoa contar a situação",
        "texto": "Obrigado! Agora me conte, com suas palavras, o que está acontecendo e com o que você precisa de ajuda.",
    },
    "relato_curto": {
        "descricao": "Relato com menos de 4 palavras (pedido uma única vez)",
        "texto": "Pode me contar um pouco mais? Por exemplo: o que aconteceu e com o que você precisa de ajuda.",
    },
    "sem_consentimento": {
        "descricao": "A pessoa não aceitou continuar",
        "texto": (
            "Tudo bem, respeitamos sua escolha. Se precisar, você pode ligar grátis para o *Disque Social 121* "
            "ou ir ao CRAS do seu bairro. Se mudar de ideia, é só mandar uma mensagem aqui."
        ),
    },
    "emergencia": {
        "descricao": "Sinal de violência (enviada na hora, sem perguntas). Precisa conter 190, 180 e 100.",
        "texto": (
            "🚨 *Sua segurança vem primeiro.*\n\n"
            "Se estiver em perigo agora, ligue *190* (Polícia).\n"
            "Violência contra a mulher: *Ligue 180*.\n"
            "Crianças, idosos ou pessoas com deficiência: *Disque 100*.\n"
            "Você também pode procurar o *CREAS* de Anápolis, que atende casos de violência.\n\n"
            "Sua mensagem foi enviada com prioridade para a equipe da assistência social."
        ),
    },
    "nao_entendi": {
        "descricao": "O sistema não identificou a necessidade com segurança",
        "texto": (
            "Não consegui entender com segurança qual é a sua necessidade, e não quero te orientar errado.\n\n"
            "Você pode ligar grátis para o *Disque Social 121* ou procurar o *CRAS* do seu bairro, "
            "onde um profissional vai te ouvir. Se quiser, me conte de outro jeito."
        ),
    },
    "audio": {
        "descricao": "A pessoa mandou áudio",
        "texto": "Por enquanto eu só consigo ler mensagens escritas. Pode me contar por texto? 🙏",
    },
    "contato_confirmado": {
        "descricao": "A pessoa pediu contato do CRAS (triagem entra na fila)",
        "texto": (
            "Pronto! ✅ Sua solicitação foi enviada para a equipe do CRAS, que vai entrar em contato por este número. "
            "Enquanto isso, separe os documentos da lista acima."
        ),
    },
    "contato_recusado": {
        "descricao": "A pessoa não quis contato do CRAS",
        "texto": "Tudo bem! Se precisar de novo, é só mandar uma mensagem. Cuide-se. 💚",
    },
    "nao_entendi_de_novo": {
        "descricao": "Segunda vez sem identificar a necessidade: oferece o menu de assuntos",
        "texto": "Ainda não consegui entender com segurança. Se preferir, escolha o assunto pelo número:",
    },
    "retorno": {
        "descricao": "Pessoa que já aceitou antes e volta a escrever",
        "texto": "Olá de novo! 👋 Me conte, com suas palavras, o que está acontecendo e com o que você precisa de ajuda.",
    },
    "agradecimento": {
        "descricao": "Resposta a \"obrigado\", \"valeu\" etc. depois do fim da conversa",
        "texto": "De nada! Se precisar de novo, é só mandar uma mensagem. 💚",
    },
    "apagar_confirmar": {
        "descricao": "A pessoa pediu para apagar os dados (pede confirmação)",
        "texto": (
            "Você quer apagar *tudo o que conversou aqui* e os pedidos enviados ao CRAS por este número?\n"
            "Isso não pode ser desfeito.\n*1* - Sim, apagar\n*2* - Não"
        ),
    },
    "apagar_feito": {
        "descricao": "Dados apagados a pedido da pessoa",
        "texto": "Pronto, seus dados desta conversa foram apagados. 🗑️ Se precisar, é só mandar uma nova mensagem.",
    },
    "apagar_cancelado": {
        "descricao": "A pessoa desistiu de apagar os dados",
        "texto": "Tudo bem, nada foi apagado. Se quiser continuar, me mande uma mensagem.",
    },
    "atendente_assumiu": {
        "descricao": "Enviada quando um atendente assume a conversa pelo painel",
        "texto": "Olá! Agora quem fala com você é uma pessoa da equipe da Assistência Social. 🙂",
    },
}

CAMPOS_SERVICO = ("titulo", "servicos", "documentos", "local_atendimento", "contato_util")
OBRIGATORIOS_EMERGENCIA = ("190", "180", "100")

_servicos: Dict[str, dict] = copy.deepcopy(KNOWLEDGE_SERVICES)
_textos: Dict[str, str] = {k: v["texto"] for k, v in TEXTOS_PADRAO.items()}


def servico(categoria: str) -> dict:
    """Dados de serviço da categoria. 'urgencia' não é editável: vem sempre do padrão."""
    dados = dict(_servicos.get(categoria) or KNOWLEDGE_SERVICES[categoria])
    dados["urgencia"] = KNOWLEDGE_SERVICES[categoria]["urgencia"]
    return dados


def texto(chave: str) -> str:
    return _textos.get(chave, TEXTOS_PADRAO[chave]["texto"])


def validar_texto(chave: str, valor: str) -> Optional[str]:
    """Devolve uma mensagem de erro, ou None se o texto puder ser salvo."""
    if chave not in TEXTOS_PADRAO:
        return "Texto desconhecido."
    if not valor.strip():
        return "O texto não pode ficar vazio."
    if chave == "emergencia":
        faltando = [n for n in OBRIGATORIOS_EMERGENCIA if n not in valor]
        if faltando:
            return f"A mensagem de emergência precisa conter os números {', '.join(faltando)}."
    return None


def _limpar_lista(itens: List[str]) -> List[str]:
    return [i.strip() for i in itens if i and i.strip()]


async def carregar(session: AsyncSession) -> None:
    """Cria no banco o que ainda não existe (com os padrões) e atualiza a cópia em memória."""
    salvos = {s.categoria: s for s in (await session.execute(select(ServicoCategoria))).scalars()}
    for categoria, padrao in KNOWLEDGE_SERVICES.items():
        if categoria not in salvos:
            linha = ServicoCategoria(categoria=categoria, **{c: copy.deepcopy(padrao[c]) for c in CAMPOS_SERVICO})
            session.add(linha)
            salvos[categoria] = linha
    textos = {t.chave: t for t in (await session.execute(select(TextoBot))).scalars()}
    for chave, padrao in TEXTOS_PADRAO.items():
        if chave not in textos:
            linha = TextoBot(chave=chave, texto=padrao["texto"])
            session.add(linha)
            textos[chave] = linha
    await session.commit()

    for categoria, linha in salvos.items():
        if categoria in KNOWLEDGE_SERVICES:
            _servicos[categoria] = {c: getattr(linha, c) for c in CAMPOS_SERVICO}
    for chave, linha in textos.items():
        if chave in TEXTOS_PADRAO:
            _textos[chave] = linha.texto


async def listar_servicos(session: AsyncSession) -> List[dict]:
    linhas = {s.categoria: s for s in (await session.execute(select(ServicoCategoria))).scalars()}
    saida = []
    for categoria in KNOWLEDGE_SERVICES:
        linha = linhas.get(categoria)
        saida.append({
            "categoria": categoria,
            **servico(categoria),
            "fonte": (linha.fonte or "") if linha else "",
            "verificado_em": linha.verificado_em.isoformat() if linha and linha.verificado_em else None,
            "atualizado_em": linha.atualizado_em.isoformat() if linha and linha.atualizado_em else None,
            "atualizado_por": linha.atualizado_por if linha else None,
        })
    return saida


async def salvar_servico(session: AsyncSession, categoria: str, dados: dict, usuario: str) -> dict:
    linha = await session.get(ServicoCategoria, categoria)
    linha.titulo = dados["titulo"].strip()
    linha.servicos = _limpar_lista(dados["servicos"])
    linha.documentos = _limpar_lista(dados["documentos"])
    linha.local_atendimento = dados["local_atendimento"].strip()
    linha.contato_util = dados["contato_util"].strip()
    linha.fonte = (dados.get("fonte") or "").strip()
    linha.verificado_em = dados.get("verificado_em")
    linha.atualizado_em, linha.atualizado_por = agora(), usuario
    await session.commit()
    await carregar(session)
    return servico(categoria)


async def listar_textos(session: AsyncSession) -> List[dict]:
    linhas = {t.chave: t for t in (await session.execute(select(TextoBot))).scalars()}
    return [
        {
            "chave": chave,
            "descricao": padrao["descricao"],
            "texto": texto(chave),
            "padrao": padrao["texto"],
            "atualizado_em": linhas[chave].atualizado_em.isoformat() if chave in linhas and linhas[chave].atualizado_em else None,
            "atualizado_por": linhas[chave].atualizado_por if chave in linhas else None,
        }
        for chave, padrao in TEXTOS_PADRAO.items()
    ]


async def salvar_texto(session: AsyncSession, chave: str, valor: str, usuario: str) -> str:
    linha = await session.get(TextoBot, chave)
    linha.texto = valor.strip()
    linha.atualizado_em, linha.atualizado_por = agora(), usuario
    await session.commit()
    await carregar(session)
    return texto(chave)


async def restaurar_servico(session: AsyncSession, categoria: str, usuario: str) -> dict:
    # O texto original não tem fonte conferida: fonte e data voltam a ficar em branco
    return await salvar_servico(session, categoria, copy.deepcopy(KNOWLEDGE_SERVICES[categoria]), usuario)
