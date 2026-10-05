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
- Com um atendente na conversa (atendimento_humano), o bot só registra as mensagens.

Os textos vêm de services/catalogo.py e podem ser editados pelo CRAS no painel.
Respostas são texto com opções numeradas (1/2): botões interativos não funcionam de forma
confiável na Evolution/Baileys.
"""
from datetime import timedelta
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import encrypt_secret, mask_phone
from app.models import Conversa, Mensagem, agora
from app.services import catalogo
from app.services.anonimizacao import anonimizar_texto, hash_telefone
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.text_rules import normalizar
from app.services.ml.train_evaluator import CATEGORIAS, NAO_IDENTIFICADO, VIOLENCIA
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


def caminho_completo(categoria: str) -> str:
    info = catalogo.servico(categoria)
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


def registrar(session: AsyncSession, conversa: Conversa, autor: str, texto: str) -> None:
    session.add(Mensagem(conversa_id=conversa.telefone_hash, autor=autor, texto=texto))


async def obter_conversa(session: AsyncSession, telefone: str, canal: str) -> Conversa:
    chave = hash_telefone(telefone)
    conversa = await session.get(Conversa, chave)
    if conversa is None:
        conversa = Conversa(
            telefone_hash=chave, estado="NOVA", canal=canal,
            telefone_cifrado=encrypt_secret(telefone), telefone_mascarado=mask_phone(telefone),
        )
        session.add(conversa)
    return conversa


async def processar_mensagem(session: AsyncSession, telefone: str, texto: Optional[str],
                             canal: str = "evolution", is_audio: bool = False) -> List[str]:
    """Recebe uma mensagem do cidadão e devolve as mensagens que o bot deve enviar.
    Persiste estado e histórico."""
    conversa = await obter_conversa(session, telefone, canal)
    texto = (texto or "").strip()
    registrar(session, conversa, "cidadao", "[áudio]" if is_audio else anonimizar_texto(texto))
    conversa.nao_lidas = (conversa.nao_lidas or 0) + 1

    try:
        if conversa.atendimento_humano:
            return []  # o atendente responde pelo painel
        if is_audio:
            respostas = [catalogo.texto("audio")]
        else:
            expirada = conversa.atualizado_em is not None and \
                conversa.atualizado_em.replace(tzinfo=agora().tzinfo) < agora() - timedelta(minutes=settings.CONVERSA_EXPIRA_MIN)
            if expirada or conversa.estado == "FINALIZADA":
                conversa.estado, conversa.tentativas, conversa.relato = "NOVA", 0, None
                conversa.categoria_sugerida = conversa.categoria_escolhida = None
                conversa.classificacao = None
            respostas = await _passo(session, conversa, telefone, texto)
        for r in respostas:
            registrar(session, conversa, "bot", r)
        return respostas
    finally:
        conversa.atualizado_em = agora()
        await session.commit()


async def _emergencia(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto))
    await criar_triagem(session, texto, classificacao, canal="whatsapp", telefone=telefone,
                        nome="Contato via WhatsApp", categoria_final=VIOLENCIA, conversa_id=conversa.telefone_hash)
    conversa.estado = "FINALIZADA"
    return [catalogo.texto("emergencia")]


async def _passo(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    estado = conversa.estado
    # Classifica o mesmo texto que será gravado (sem CPF/telefone/e-mail)
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto)) if texto else None

    # Violência interrompe qualquer etapa (exceto respostas curtas de menu, como "1" ou "sim")
    if classificacao and classificacao["categoria"] == VIOLENCIA and _resposta(texto) is None and not texto.isdigit():
        return await _emergencia(session, conversa, telefone, texto)

    if estado == "NOVA":
        conversa.estado = "AGUARDANDO_CONSENTIMENTO"
        return [catalogo.texto("boas_vindas")]

    if estado == "AGUARDANDO_CONSENTIMENTO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.estado = "AGUARDANDO_RELATO"
            return [catalogo.texto("pedir_relato")]
        if resposta is False:
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("sem_consentimento")]
        return ["Para continuar, responda *1* (Sim, concordo) ou *2* (Não)."]

    if estado == "AGUARDANDO_RELATO":
        if len(texto.split()) < 4 and conversa.tentativas == 0:
            conversa.tentativas = 1
            return [catalogo.texto("relato_curto")]
        if classificacao["categoria"] == NAO_IDENTIFICADO:
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("nao_entendi")]
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
            return [caminho_completo(conversa.categoria_escolhida)]
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
            return [caminho_completo(escolhida)]
        return [f"Responda só com o número, de 1 a {len(CATEGORIAS)}."]

    if estado == "AGUARDANDO_CONTATO":
        resposta = _resposta(texto)
        if resposta is None:
            return ["Responda *1* para o CRAS entrar em contato ou *2* para não."]
        conversa.estado = "FINALIZADA"
        if resposta is False:
            return [catalogo.texto("contato_recusado")]
        await criar_triagem(
            session, conversa.relato, conversa.classificacao, canal="whatsapp", telefone=telefone,
            nome="Contato via WhatsApp", categoria_final=conversa.categoria_escolhida,
            confirmada=True, consentiu_treino=True, conversa_id=conversa.telefone_hash,
        )
        return [catalogo.texto("contato_confirmado")]

    conversa.estado = "AGUARDANDO_CONSENTIMENTO"
    return [catalogo.texto("boas_vindas")]
