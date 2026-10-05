"""
Fluxo da conversa no WhatsApp (plano do projeto, seção 4).

  NOVA ─► AGUARDANDO_CONSENTIMENTO ─(sim)─► AGUARDANDO_RELATO ─► AGUARDANDO_CONFIRMACAO
                                                                   │ sim           │ não
                                                                   ▼               ▼
                                         FINALIZADA ◄─ AGUARDANDO_CONTATO ◄─ AGUARDANDO_CORRECAO

  Estados auxiliares: RELATO_NOVAMENTE (não entendeu uma vez), RETORNO (quem já consentiu volta
  a escrever), AGUARDANDO_BAIRRO (só quando há CRAS cadastrado) e CONFIRMAR_APAGAR.

Regras:
- Sinal de violência em QUALQUER etapa interrompe o fluxo e mostra os canais de emergência,
  sem perguntas antes. A triagem entra urgente na fila (proteção da vida, LGPD art. 11, II, "e").
- Relato muito curto: pede mais detalhes uma única vez.
- Nada identificado: pede para contar de outro jeito; na segunda vez, oferece o menu de assuntos
  com "Nenhum desses" (Disque Social 121 e CRAS), sem inventar resposta.
- Mais de uma necessidade: mostra o caminho da principal e um resumo das outras, por prioridade.
- Com CRAS cadastrado no painel, pergunta o bairro e indica a unidade (plano, seção 4, passo 4).
  O bairro fica guardado para as próximas conversas da pessoa. Na emergência, mostra o CREAS cadastrado.
- Comandos em qualquer etapa: "apagar" (exclui os dados da pessoa, com confirmação) e "recomeçar".
- Conversa parada além de CONVERSA_EXPIRA_MIN recomeça; quem já consentiu não é perguntado de novo.
- A triagem só entra na fila se a pessoa pedir contato do CRAS.
- Com um atendente na conversa (atendimento_humano), o bot só registra as mensagens.

Os textos vêm de services/catalogo.py e podem ser editados pelo CRAS no painel.
Respostas são texto com opções numeradas (1/2): botões interativos não funcionam de forma
confiável na Evolution/Baileys.
"""
from datetime import timedelta
from typing import List, Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import encrypt_secret, mask_phone
from app.models import Conversa, Mensagem, Triagem, agora
from app.services import catalogo, unidades
from app.services.anonimizacao import anonimizar_texto, hash_telefone
from app.services.ml.classifier_service import PRIORIDADE_POR_CATEGORIA, SocialClassifierService
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

COMANDO_APAGAR = {"apagar", "apagar meus dados", "apagar dados", "excluir meus dados", "excluir dados", "apague meus dados"}
COMANDO_RECOMECAR = {"recomecar", "reiniciar", "comecar de novo", "menu", "inicio", "voltar ao inicio"}
AGRADECIMENTO = {"obrigado", "obrigada", "obg", "brigado", "brigada", "valeu", "vlw", "agradeco", "muito obrigado",
                 "muito obrigada", "ok obrigado", "ok obrigada", "ok", "beleza", "blz", "ta bom", "certo", "👍", "🙏"}
# Casos de violência ainda abertos ficam com a equipe mesmo se a pessoa pedir para apagar (proteção da vida)
STATUS_PRESERVADOS_AO_APAGAR = {"URGENTE_CREAS"}

ORDEM_PRIORIDADE = {"URGENTE_VIOLENCIA": 0, "ALTA": 1, "MEDIA": 2, "BAIXA": 3}


def _resposta(texto: str):
    t = normalizar(texto).strip(" .!?✅❌")
    if t in SIM or t.startswith("sim"):
        return True
    if t in NAO or t.startswith("nao"):
        return False
    return None


OPCAO_NENHUM = len(CATEGORIAS) + 1


def _menu_categorias(introducao: str = "Sem problema! Qual destes assuntos combina mais com a sua situação? Responda com o número:") -> str:
    linhas = [f"*{i}* - {NOMES_CATEGORIA[c]}" for i, c in enumerate(CATEGORIAS, start=1)]
    linhas.append(f"*{OPCAO_NENHUM}* - Nenhum desses")
    return introducao + "\n\n" + "\n".join(linhas)


def _secundarias_por_prioridade(principal: str, secundarias: Sequence[str]) -> List[str]:
    validas = [c for c in dict.fromkeys(secundarias) if c != principal and c in NOMES_CATEGORIA and c != VIOLENCIA]
    return sorted(validas, key=lambda c: ORDEM_PRIORIDADE.get(PRIORIDADE_POR_CATEGORIA.get(c, "BAIXA"), 3))


def caminho_completo(categoria: str, secundarias: Sequence[str] = (), cras: Optional[str] = None,
                     aviso_bairro: Optional[str] = None) -> str:
    """cras: descrição da unidade do bairro da pessoa (quando há CRAS cadastrado);
    aviso_bairro: texto quando o bairro não foi encontrado."""
    info = catalogo.servico(categoria)
    servicos = "\n".join(f"• {s}" for s in info["servicos"])
    documentos = "\n".join(f"• {d}" for d in info["documentos"])
    texto = (
        f"📋 *{info['titulo']}*\n\n"
        f"*O que você pode procurar:*\n{servicos}\n\n"
        f"*Documentos para levar:*\n{documentos}\n\n"
        f"*Onde ir:* {info['local_atendimento']}\n"
        + (f"*CRAS do seu bairro:* {cras}\n" if cras else "")
        + (f"{aviso_bairro}\n" if aviso_bairro else "")
        + f"*Contato:* {info['contato_util']}\n\n"
    )
    # Plano, seção 4: mais de uma necessidade → mostrar todas, em ordem de prioridade
    for outra in _secundarias_por_prioridade(categoria, secundarias):
        extra = catalogo.servico(outra)
        texto += (
            f"➕ *Você também falou de {NOMES_CATEGORIA[outra]}:* {extra['titulo']}\n"
            f"Procure: {'; '.join(extra['servicos'])}.\n"
            f"Leve: {'; '.join(extra['documentos'])}.\n"
            f"Onde: {extra['local_atendimento']}\n\n"
        )
    return texto + (
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
                # Quem já consentiu não precisa aceitar de novo a cada conversa
                conversa.estado = "RETORNO" if conversa.consentiu_em else "NOVA"
                conversa.tentativas, conversa.relato = 0, None
                conversa.categoria_sugerida = conversa.categoria_escolhida = None
                conversa.classificacao = None
            respostas = await _passo(session, conversa, telefone, texto)
        apagada = getattr(conversa, "_apagada", False)
        if not apagada:
            for r in respostas:
                registrar(session, conversa, "bot", r)
        return respostas
    finally:
        if not getattr(conversa, "_apagada", False):
            conversa.atualizado_em = agora()
        await session.commit()


async def _apagar_dados(session: AsyncSession, conversa: Conversa) -> bool:
    """Direito do titular (LGPD art. 18): apaga histórico, conversa e triagens deste número.
    Casos de violência ainda abertos ficam com a equipe. Devolve True se algum caso foi mantido."""
    chave = conversa.telefone_hash
    await session.execute(
        delete(Triagem).where(Triagem.conversa_id == chave, Triagem.status.not_in(STATUS_PRESERVADOS_AO_APAGAR))
    )
    mantidos = (await session.execute(select(func.count()).select_from(Triagem).where(Triagem.conversa_id == chave))).scalar_one()
    await session.execute(delete(Mensagem).where(Mensagem.conversa_id == chave))
    await session.delete(conversa)
    conversa._apagada = True  # marcador em memória: nada mais é gravado para esta conversa
    return mantidos > 0


async def _emergencia(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto))
    await criar_triagem(session, texto, classificacao, canal="whatsapp", telefone=telefone,
                        nome="Contato via WhatsApp", categoria_final=VIOLENCIA, conversa_id=conversa.telefone_hash)
    conversa.estado = "FINALIZADA"
    creas = await unidades.creas_ativo(session)
    return [catalogo.texto("emergencia") + (f"\n\n📍 CREAS: {unidades.descricao(creas)}" if creas else "")]


async def _ir_para_caminho(session: AsyncSession, conversa: Conversa, categoria: str, secundarias: Sequence[str] = ()) -> List[str]:
    """Plano, seção 4, passo 4: com CRAS cadastrado, pergunta o bairro antes de mostrar o caminho."""
    conversa.categoria_escolhida = categoria
    if await unidades.tem_cras_ativo(session) and not conversa.bairro:
        conversa.estado = "AGUARDANDO_BAIRRO"
        return [catalogo.texto("pedir_bairro")]
    return await _mostrar_caminho(session, conversa, secundarias)


async def _mostrar_caminho(session: AsyncSession, conversa: Conversa, secundarias: Sequence[str] = ()) -> List[str]:
    conversa.estado = "AGUARDANDO_CONTATO"
    cras = aviso = None
    if conversa.bairro and await unidades.tem_cras_ativo(session):
        unidade = await unidades.cras_do_bairro(session, conversa.bairro)
        if unidade:
            cras = unidades.descricao(unidade)
        else:
            aviso = catalogo.texto("bairro_nao_encontrado")
    return [caminho_completo(conversa.categoria_escolhida, secundarias, cras=cras, aviso_bairro=aviso)]


async def _passo(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    estado = conversa.estado
    texto_norm = normalizar(texto).strip(" .!?")

    # Comandos que valem em qualquer etapa. Vêm antes da regra de violência porque só casam com a
    # mensagem inteira (nunca com um relato) e o modelo pode confundir "apagar meus dados" com ameaça.
    if texto_norm in COMANDO_APAGAR and estado != "CONFIRMAR_APAGAR":
        conversa.estado = "CONFIRMAR_APAGAR"
        return [catalogo.texto("apagar_confirmar")]
    if texto_norm in COMANDO_RECOMECAR:
        if not conversa.consentiu_em:
            conversa.estado = "AGUARDANDO_CONSENTIMENTO"
            return [catalogo.texto("boas_vindas")]
        conversa.estado, conversa.tentativas = "AGUARDANDO_RELATO", 0
        conversa.relato = conversa.categoria_sugerida = conversa.categoria_escolhida = None
        conversa.classificacao = None
        return [catalogo.texto("pedir_relato")]

    # Classifica o mesmo texto que será gravado (sem CPF/telefone/e-mail)
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto)) if texto else None

    # Violência interrompe qualquer etapa (exceto respostas curtas de menu, como "1" ou "sim")
    if classificacao and classificacao["categoria"] == VIOLENCIA and _resposta(texto) is None and not texto.isdigit():
        return await _emergencia(session, conversa, telefone, texto)

    if estado == "CONFIRMAR_APAGAR":
        resposta = _resposta(texto)
        if resposta is True:
            mantido = await _apagar_dados(session, conversa)
            aviso = ("\n\nO pedido de ajuda urgente que você enviou continua com a equipe até o atendimento, "
                     "para a sua proteção.") if mantido else ""
            return [catalogo.texto("apagar_feito") + aviso]
        if resposta is False:
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("apagar_cancelado")]
        return ["Responda *1* para apagar seus dados ou *2* para manter."]

    if estado == "NOVA":
        conversa.estado = "AGUARDANDO_CONSENTIMENTO"
        return [catalogo.texto("boas_vindas")]

    if estado == "RETORNO":
        if texto_norm in AGRADECIMENTO:
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("agradecimento")]
        conversa.estado = "AGUARDANDO_RELATO"
        if len(texto.split()) < 4:  # "oi", "bom dia": cumprimenta e pede o relato
            return [catalogo.texto("retorno")]
        estado = "AGUARDANDO_RELATO"  # mensagem longa já é o relato

    if estado == "AGUARDANDO_CONSENTIMENTO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.consentiu_em = agora()
            conversa.estado = "AGUARDANDO_RELATO"
            return [catalogo.texto("pedir_relato")]
        if resposta is False:
            conversa.consentiu_em = None
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("sem_consentimento")]
        return ["Para continuar, responda *1* (Sim, concordo) ou *2* (Não)."]

    if estado in ("AGUARDANDO_RELATO", "RELATO_NOVAMENTE"):
        if len(texto.split()) < 4 and conversa.tentativas == 0:
            conversa.tentativas = 1
            return [catalogo.texto("relato_curto")]
        conversa.relato = anonimizar_texto(texto)
        conversa.classificacao = classificacao
        if classificacao["categoria"] == NAO_IDENTIFICADO:
            if estado == "AGUARDANDO_RELATO":
                conversa.estado = "RELATO_NOVAMENTE"
                return [catalogo.texto("nao_entendi")]
            conversa.estado = "AGUARDANDO_CORRECAO"
            return [_menu_categorias(catalogo.texto("nao_entendi_de_novo"))]
        conversa.categoria_sugerida = classificacao["categoria"]
        conversa.estado = "AGUARDANDO_CONFIRMACAO"
        assuntos = [NOMES_CATEGORIA[classificacao["categoria"]]] + [
            NOMES_CATEGORIA[c] for c in _secundarias_por_prioridade(classificacao["categoria"], classificacao.get("necessidades_secundarias", []))
        ]
        return [f"Entendi que você precisa de ajuda com *{' e '.join(assuntos)}*. Está certo?\n*1* - Sim\n*2* - Não"]

    if estado == "AGUARDANDO_CONFIRMACAO":
        resposta = _resposta(texto)
        if resposta is True:
            secundarias = (conversa.classificacao or {}).get("necessidades_secundarias", [])
            return await _ir_para_caminho(session, conversa, conversa.categoria_sugerida, secundarias)
        if resposta is False:
            conversa.estado = "AGUARDANDO_CORRECAO"
            return [_menu_categorias()]
        return ["Responda *1* se eu entendi certo ou *2* se não."]

    if estado == "AGUARDANDO_CORRECAO":
        if texto.isdigit() and int(texto) == OPCAO_NENHUM:
            conversa.estado = "FINALIZADA"
            return [catalogo.texto("nao_entendi")]
        if texto.isdigit() and 1 <= int(texto) <= len(CATEGORIAS):
            escolhida = CATEGORIAS[int(texto) - 1]
            if escolhida == VIOLENCIA:
                return await _emergencia(session, conversa, telefone, conversa.relato or texto)
            return await _ir_para_caminho(session, conversa, escolhida)
        return [f"Responda só com o número, de 1 a {OPCAO_NENHUM}."]

    if estado == "AGUARDANDO_BAIRRO":
        # "não sei" segue sem bairro; qualquer outra resposta é guardada como bairro
        conversa.bairro = None if normalizar(texto).strip(" .!?") in unidades.NAO_SEI else texto.strip()[:80]
        secundarias = []
        if conversa.categoria_escolhida == conversa.categoria_sugerida:
            secundarias = (conversa.classificacao or {}).get("necessidades_secundarias", [])
        return await _mostrar_caminho(session, conversa, secundarias)

    if estado == "AGUARDANDO_CONTATO":
        resposta = _resposta(texto)
        if resposta is None:
            return ["Responda *1* para o CRAS entrar em contato ou *2* para não."]
        conversa.estado = "FINALIZADA"
        if resposta is False:
            return [catalogo.texto("contato_recusado")]
        await criar_triagem(
            session, conversa.relato, conversa.classificacao, canal="whatsapp", telefone=telefone,
            nome="Contato via WhatsApp", categoria_final=conversa.categoria_escolhida, bairro=conversa.bairro,
            confirmada=True, consentiu_treino=True, conversa_id=conversa.telefone_hash,
        )
        return [catalogo.texto("contato_confirmado")]

    conversa.estado = "AGUARDANDO_CONSENTIMENTO"
    return [catalogo.texto("boas_vindas")]
