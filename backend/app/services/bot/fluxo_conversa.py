"""
Fluxo da conversa no WhatsApp (plano do projeto, seção 4).

  NOVA ─► AGUARDANDO_CONSENTIMENTO ─(sim)─► AGUARDANDO_RELATO ─► AGUARDANDO_CONFIRMACAO
                                                                   │ sim           │ não
                                                                   ▼               ▼
                                         FINALIZADA ◄─ AGUARDANDO_CONTATO ◄─ AGUARDANDO_CORRECAO

Regras:
- Sinal de violência em QUALQUER etapa interrompe o fluxo e mostra os canais de emergência,
  sem perguntas antes. A triagem entra urgente na fila (proteção da vida, LGPD art. 11, II, "e").
- Relato muito curto: pede mais detalhes uma única vez.
- Nada identificado: oferece o Disque Social 121 e o CRAS, sem inventar resposta.
- Conversa parada além de CONVERSA_EXPIRA_MIN recomeça do início.
- A triagem só entra na fila se a pessoa pedir contato do CRAS.

Respostas são texto com opções numeradas (1/2): botões interativos não funcionam de forma
confiável na Evolution/Baileys.
"""
from datetime import timedelta
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Conversa, agora
from app.services.anonimizacao import anonimizar_texto, hash_telefone
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.text_rules import normalizar
from app.services.ml.train_evaluator import CATEGORIAS, KNOWLEDGE_SERVICES, NAO_IDENTIFICADO, VIOLENCIA
from app.services.triagens import criar_triagem

NOMES_CATEGORIA = {
    "renda_beneficio": "renda e benefícios (Bolsa Família, BPC)",
    "cadastro_atualizacao": "Cadastro Único (inscrição ou atualização)",
    "moradia": "moradia",
    "documentacao": "documentos (RG, CPF, certidões)",
    "alimentacao": "alimentação",
    "pessoa_idosa_pcd": "pessoa idosa ou com deficiência",
    "trabalho_renda": "trabalho e cursos",
    "violencia_protecao": "violência ou ameaça",
}

MSG_BOAS_VINDAS = (
    "Olá! Sou o assistente de orientação da Assistência Social de Anápolis. 👋\n\n"
    "Eu ajudo a descobrir *qual serviço procurar, quais documentos levar e onde ir*. "
    "Sou só uma orientação: *não decido quem tem direito a benefício* — isso é feito pelos profissionais do CRAS.\n\n"
    "Vou usar o que você me contar para te orientar e, *sem identificar você*, para melhorar este serviço. "
    "Não escreva nome, CPF ou endereço.\n\n"
    "Você concorda?\n*1* - Sim, concordo\n*2* - Não"
)
MSG_PEDIR_RELATO = "Obrigado! Agora me conte, com suas palavras, o que está acontecendo e com o que você precisa de ajuda."
MSG_RELATO_CURTO = "Pode me contar um pouco mais? Por exemplo: o que aconteceu e com o que você precisa de ajuda."
MSG_SEM_CONSENTIMENTO = (
    "Tudo bem, respeitamos sua escolha. Se precisar, você pode ligar grátis para o *Disque Social 121* "
    "ou ir ao CRAS do seu bairro. Se mudar de ideia, é só mandar uma mensagem aqui."
)
MSG_EMERGENCIA = (
    "🚨 *Sua segurança vem primeiro.*\n\n"
    "Se estiver em perigo agora, ligue *190* (Polícia).\n"
    "Violência contra a mulher: *Ligue 180*.\n"
    "Crianças, idosos ou pessoas com deficiência: *Disque 100*.\n"
    "Você também pode procurar o *CREAS* de Anápolis, que atende casos de violência.\n\n"
    "Sua mensagem foi enviada com prioridade para a equipe da assistência social."
)
MSG_NAO_ENTENDI = (
    "Não consegui entender com segurança qual é a sua necessidade, e não quero te orientar errado.\n\n"
    "Você pode ligar grátis para o *Disque Social 121* ou procurar o *CRAS* do seu bairro, "
    "onde um profissional vai te ouvir. Se quiser, me conte de outro jeito."
)
MSG_AUDIO = "Por enquanto eu só consigo ler mensagens escritas. Pode me contar por texto? 🙏"

SIM = {"1", "sim", "s", "ss", "isso", "certo", "concordo", "aceito", "pode", "quero", "claro", "ok", "beleza", "isso mesmo"}
NAO = {"2", "nao", "n", "nao quero", "errado", "nao e isso", "negativo"}


def _resposta(texto: str):
    t = normalizar(texto).strip(" .!?✅❌")
    if t in SIM or t.startswith("sim"):
        return True
    if t in NAO or t.startswith("nao"):
        return False
    return None


def _menu_categorias() -> str:
    linhas = [f"*{i}* - {NOMES_CATEGORIA[c]}" for i, c in enumerate(CATEGORIAS, start=1)]
    return "Sem problema! Qual destes assuntos combina mais com a sua situação? Responda com o número:\n\n" + "\n".join(linhas)


def _caminho_completo(categoria: str) -> str:
    info = KNOWLEDGE_SERVICES[categoria]
    servicos = "\n".join(f"• {s}" for s in info["servicos"])
    documentos = "\n".join(f"• {d}" for d in info["documentos"])
    return (
        f"📋 *{info['titulo']}*\n\n"
        f"*O que você pode procurar:*\n{servicos}\n\n"
        f"*Documentos para levar:*\n{documentos}\n\n"
        f"*Onde ir:* {info['local_atendimento']}\n"
        f"*Contato:* {info['contato_util']}\n\n"
        "Lembre: é uma orientação. Quem confirma o seu direito é o profissional do atendimento.\n\n"
        "Quer que o CRAS entre em contato com você?\n*1* - Sim\n*2* - Não, obrigado"
    )


async def _emergencia(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    classificacao = SocialClassifierService.classify_relato(texto)
    await criar_triagem(session, texto, classificacao, canal="whatsapp", telefone=telefone,
                        nome="Contato via WhatsApp", categoria_final=VIOLENCIA)
    conversa.estado = "FINALIZADA"
    return [MSG_EMERGENCIA]


async def processar_mensagem(session: AsyncSession, telefone: str, texto: str) -> List[str]:
    """Recebe uma mensagem do cidadão e devolve as mensagens a enviar. Persiste o estado."""
    chave = hash_telefone(telefone)
    conversa = await session.get(Conversa, chave)
    expirada = conversa is not None and conversa.atualizado_em.replace(tzinfo=agora().tzinfo) < agora() - timedelta(minutes=settings.CONVERSA_EXPIRA_MIN)
    if conversa is None:
        conversa = Conversa(telefone_hash=chave, estado="NOVA")
        session.add(conversa)
    elif expirada or conversa.estado == "FINALIZADA":
        conversa.estado, conversa.tentativas, conversa.relato = "NOVA", 0, None
        conversa.categoria_sugerida = conversa.categoria_escolhida = None
        conversa.classificacao = None

    try:
        respostas = await _passo(session, conversa, telefone, texto.strip())
    finally:
        conversa.atualizado_em = agora()
        await session.commit()
    return respostas


async def _passo(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    estado = conversa.estado
    # Classifica o mesmo texto que será gravado (sem CPF/telefone/e-mail)
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto)) if texto else None

    # Violência interrompe qualquer etapa (exceto respostas curtas de menu, como "1" ou "sim")
    if classificacao and classificacao["categoria"] == VIOLENCIA and _resposta(texto) is None and not texto.isdigit():
        return await _emergencia(session, conversa, telefone, texto)

    if estado == "NOVA":
        conversa.estado = "AGUARDANDO_CONSENTIMENTO"
        return [MSG_BOAS_VINDAS]

    if estado == "AGUARDANDO_CONSENTIMENTO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.estado = "AGUARDANDO_RELATO"
            return [MSG_PEDIR_RELATO]
        if resposta is False:
            conversa.estado = "FINALIZADA"
            return [MSG_SEM_CONSENTIMENTO]
        return ["Para continuar, responda *1* (Sim, concordo) ou *2* (Não)."]

    if estado == "AGUARDANDO_RELATO":
        if len(texto.split()) < 4 and conversa.tentativas == 0:
            conversa.tentativas = 1
            return [MSG_RELATO_CURTO]
        if classificacao["categoria"] == NAO_IDENTIFICADO:
            conversa.estado = "FINALIZADA"
            return [MSG_NAO_ENTENDI]
        conversa.relato = anonimizar_texto(texto)
        conversa.classificacao = classificacao
        conversa.categoria_sugerida = classificacao["categoria"]
        conversa.estado = "AGUARDANDO_CONFIRMACAO"
        assuntos = [NOMES_CATEGORIA[classificacao["categoria"]]] + [
            NOMES_CATEGORIA[c] for c in classificacao.get("necessidades_secundarias", []) if c in NOMES_CATEGORIA
        ]
        return [f"Entendi que você precisa de ajuda com *{' e '.join(assuntos)}*. Está certo?\n*1* - Sim\n*2* - Não"]

    if estado == "AGUARDANDO_CONFIRMACAO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.categoria_escolhida = conversa.categoria_sugerida
            conversa.estado = "AGUARDANDO_CONTATO"
            return [_caminho_completo(conversa.categoria_escolhida)]
        if resposta is False:
            conversa.estado = "AGUARDANDO_CORRECAO"
            return [_menu_categorias()]
        return ["Responda *1* se eu entendi certo ou *2* se não."]

    if estado == "AGUARDANDO_CORRECAO":
        if texto.isdigit() and 1 <= int(texto) <= len(CATEGORIAS):
            escolhida = CATEGORIAS[int(texto) - 1]
            if escolhida == VIOLENCIA:
                return await _emergencia(session, conversa, telefone, conversa.relato or texto)
            conversa.categoria_escolhida = escolhida
            conversa.estado = "AGUARDANDO_CONTATO"
            return [_caminho_completo(escolhida)]
        return [f"Responda só com o número, de 1 a {len(CATEGORIAS)}."]

    if estado == "AGUARDANDO_CONTATO":
        resposta = _resposta(texto)
        if resposta is None:
            return ["Responda *1* para o CRAS entrar em contato ou *2* para não."]
        conversa.estado = "FINALIZADA"
        if resposta is False:
            return ["Tudo bem! Se precisar de novo, é só mandar uma mensagem. Cuide-se. 💚"]
        await criar_triagem(
            session, conversa.relato, conversa.classificacao, canal="whatsapp", telefone=telefone,
            nome="Contato via WhatsApp", categoria_final=conversa.categoria_escolhida,
            confirmada=True, consentiu_treino=True,
        )
        return ["Pronto! ✅ Sua solicitação foi enviada para a equipe do CRAS, que vai entrar em contato por este número. "
                "Enquanto isso, separe os documentos da lista acima."]

    conversa.estado = "AGUARDANDO_CONSENTIMENTO"
    return [MSG_BOAS_VINDAS]
