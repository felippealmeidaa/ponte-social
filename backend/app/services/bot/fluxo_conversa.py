"""
Fluxo da conversa no WhatsApp (plano do projeto, seção 4).

  NOVA ─► AGUARDANDO_CONSENTIMENTO ─(sim)─► AGUARDANDO_RELATO ─► AGUARDANDO_CONFIRMACAO
                                                                   │ sim           │ não
                                                                   ▼               ▼
                                         FINALIZADA ◄─ AGUARDANDO_CONTATO ◄─ AGUARDANDO_CORRECAO

  Com CRAS cadastrado, o local vem logo depois do aceite (AGUARDANDO_BAIRRO): a pessoa escolhe se e como
  informa onde mora (pino de localização do WhatsApp, CEP ou bairro) ou prefere não informar. Isso escolhe o
  CRAS (lista de bairros da prefeitura ou, sem ela, o mais perto) e, daí em diante, valem os textos, as
  respostas e as opções de fluxo daquele CRAS. Do CEP, ficam só o bairro e o ponto arredondado.
  O ponto também ordena os lugares do caminho: os que atendem a necessidade, do mais perto ao mais longe.
  Estados auxiliares: RELATO_NOVAMENTE (não entendeu uma vez), RETORNO (quem já consentiu volta
  a escrever) e CONFIRMAR_APAGAR.

Regras:
- Sinal de violência em QUALQUER etapa interrompe o fluxo e mostra os canais de emergência,
  sem perguntas antes. A triagem entra urgente na fila (proteção da vida, LGPD art. 11, II, "e").
- Relato muito curto: pede mais detalhes uma única vez.
- Nada identificado: pede para contar de outro jeito; na segunda vez, oferece o menu de assuntos
  com "Nenhum desses" (Disque Social 121 e CRAS), sem inventar resposta.
- Mais de uma necessidade: mostra o caminho da principal e um resumo das outras, por prioridade.
- Número único para a cidade: o bairro define o CRAS (plano, seção 4, passo 4) e fica guardado.
  Cada CRAS escolhe: confirmar ou não a necessidade, pedir detalhes de relato curto, menu de assuntos na
  1ª ou 2ª falha, mostrar outras necessidades e como fica o contato (perguntar, sempre ou nunca).
  Travados para todos: violência, aceite, "apagar" e "recomeçar". Na emergência, mostra o CREAS cadastrado.
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
from app.models import Conversa, Mensagem, Triagem, UnidadeAtendimento, agora
from app.services import catalogo, geo, unidades
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

# Etapas em que a mensagem é o relato da pessoa: só nelas a IA lê o texto
ETAPAS_DE_RELATO = {"AGUARDANDO_RELATO", "RELATO_NOVAMENTE", "RETORNO"}

SIM = {"1", "sim", "s", "ss", "isso", "certo", "concordo", "aceito", "pode", "quero", "claro", "ok", "beleza", "isso mesmo"}
NAO = {"2", "nao", "n", "nao quero", "errado", "nao e isso", "negativo"}

# Escolha de como informar onde mora (texto pedir_bairro). "4" (prefiro não informar) segue sem local.
OPCOES_LOCAL = {"1": "pedir_localizacao", "2": "pedir_cep", "3": "pedir_nome_bairro"}

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


def caminho_completo(categoria: str, secundarias: Sequence[str] = (), locais: str = "",
                     unidade: Optional[str] = None, perguntar_contato: bool = True) -> str:
    """Resposta com o caminho da necessidade, usando as respostas do CRAS (ou o padrão da secretaria).
    locais: bloco com os lugares da rede que atendem a necessidade (unidades.bloco_locais)."""
    info = catalogo.servico(categoria, unidade)
    servicos = "\n".join(f"• {s}" for s in info["servicos"])
    documentos = "\n".join(f"• {d}" for d in info["documentos"])
    texto = (
        f"📋 *{info['titulo']}*\n\n"
        f"*O que você pode procurar:*\n{servicos}\n\n"
        f"*Documentos para levar:*\n{documentos}\n\n"
        f"*Onde ir:* {info['local_atendimento']}\n"
        f"*Contato:* {info['contato_util']}\n\n"
        + (f"{locais}\n\n" if locais else "")
    )
    # Plano, seção 4: mais de uma necessidade → mostrar todas, em ordem de prioridade
    for outra in _secundarias_por_prioridade(categoria, secundarias):
        extra = catalogo.servico(outra, unidade)
        texto += (
            f"➕ *Você também falou de {NOMES_CATEGORIA[outra]}:* {extra['titulo']}\n"
            f"Procure: {'; '.join(extra['servicos'])}.\n"
            f"Leve: {'; '.join(extra['documentos'])}.\n"
            f"Onde: {extra['local_atendimento']}\n\n"
        )
    texto += "Lembre: é uma orientação. Quem confirma o seu direito é o profissional do atendimento."
    if perguntar_contato:
        texto += (
            "\n\nQuer que o CRAS entre em contato com você?\n"
            "*1* - Sim, enviar meu pedido ao CRAS\n"
            "*2* - Não. Atenção: aí seu pedido *não chega ao CRAS* e você precisa ir até lá"
        )
    return texto


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
                             canal: str = "evolution", is_audio: bool = False,
                             localizacao: Optional[geo.Ponto] = None) -> List[str]:
    """Recebe uma mensagem do cidadão e devolve as mensagens que o bot deve enviar.
    localizacao: pino de localização do WhatsApp (latitude, longitude). Persiste estado e histórico."""
    conversa = await obter_conversa(session, telefone, canal)
    texto = (texto or "").strip()
    localizacao = localizacao or geo.coordenadas_no_texto(texto)
    if localizacao:
        texto = ""
    registrar(session, conversa, "cidadao",
              "[áudio]" if is_audio else "[localização enviada]" if localizacao else anonimizar_texto(texto))
    conversa.nao_lidas = (conversa.nao_lidas or 0) + 1

    try:
        if conversa.atendimento_humano:
            return []  # o atendente responde pelo painel
        if is_audio:
            respostas = [catalogo.texto("audio", conversa.unidade_id)]
        else:
            expirada = conversa.atualizado_em is not None and \
                conversa.atualizado_em.replace(tzinfo=agora().tzinfo) < agora() - timedelta(minutes=settings.CONVERSA_EXPIRA_MIN)
            if expirada or conversa.estado == "FINALIZADA":
                # Quem já consentiu não precisa aceitar de novo a cada conversa
                conversa.estado = "RETORNO" if conversa.consentiu_em else "NOVA"
                conversa.tentativas, conversa.relato = 0, None
                conversa.categoria_sugerida = conversa.categoria_escolhida = None
                conversa.classificacao = None
                if conversa.bairro:  # a coordenação pode ter mudado os bairros de cada CRAS
                    unidade = await unidades.cras_de_referencia(session, conversa.bairro, _ponto(conversa))
                    conversa.unidade_id = unidade.id if unidade else None
            if localizacao and conversa.consentiu_em and conversa.estado != "AGUARDANDO_BAIRRO":
                respostas = await _localizacao_avulsa(session, conversa, localizacao)
            else:
                respostas = await _passo(session, conversa, telefone, texto, localizacao)
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


async def _registrar_triagem(session: AsyncSession, conversa: Conversa, telefone: str) -> None:
    classificacao = conversa.classificacao or {}
    await criar_triagem(
        session, conversa.relato, classificacao, canal="whatsapp", telefone=telefone,
        nome="Contato via WhatsApp", categoria_final=conversa.categoria_escolhida, bairro=conversa.bairro,
        confirmada=bool(classificacao.get("confirmada")), consentiu_treino=True,
        conversa_id=conversa.telefone_hash, unidade_id=conversa.unidade_id,
    )


async def _emergencia(session: AsyncSession, conversa: Conversa, telefone: str, texto: str) -> List[str]:
    classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto))
    await criar_triagem(session, texto, classificacao, canal="whatsapp", telefone=telefone,
                        nome="Contato via WhatsApp", categoria_final=VIOLENCIA, bairro=conversa.bairro,
                        conversa_id=conversa.telefone_hash, unidade_id=conversa.unidade_id)
    conversa.estado = "FINALIZADA"
    locais = await unidades.locais_para(session, VIOLENCIA, _ponto(conversa), conversa.bairro, limite=2)
    bloco = unidades.bloco_locais(locais, titulo="📍 *Onde buscar proteção:*")
    return [catalogo.texto("emergencia", conversa.unidade_id) + (f"\n\n{bloco}" if bloco else "")]


def _ponto(conversa: Conversa) -> Optional[geo.Ponto]:
    if conversa.latitude is None or conversa.longitude is None:
        return None
    return conversa.latitude, conversa.longitude


async def _definir_local(session: AsyncSession, conversa: Conversa, bairro: Optional[str],
                         localizacao: Optional[geo.Ponto], endereco: Optional[str] = None) -> Optional[UnidadeAtendimento]:
    """Guarda o ponto aproximado da pessoa (pino, rua do CEP ou centro do bairro) e escolhe o CRAS de referência.
    O CEP e a rua não são guardados: só o bairro e o ponto arredondado."""
    if localizacao:
        conversa.latitude, conversa.longitude = geo.arredondar(*localizacao)
        bairro = await geo.bairro_do_ponto(_ponto(conversa)) or "Localização pelo WhatsApp"
    elif bairro and (centro := (endereco and await geo.buscar(endereco)) or await geo.buscar(bairro)):
        conversa.latitude, conversa.longitude = geo.arredondar(*centro)
    conversa.bairro = bairro
    unidade = await unidades.cras_de_referencia(session, bairro, _ponto(conversa))
    conversa.unidade_id = unidade.id if unidade else None
    return unidade


async def _localizacao_avulsa(session: AsyncSession, conversa: Conversa, localizacao: geo.Ponto) -> List[str]:
    """Pino enviado fora da pergunta do bairro: atualiza o ponto e, se o caminho já saiu, mostra os lugares mais perto."""
    await _definir_local(session, conversa, None, localizacao)
    resposta = "Recebi sua localização. 📍"
    if conversa.categoria_escolhida:
        bloco = unidades.bloco_locais(await unidades.locais_para(session, conversa.categoria_escolhida, _ponto(conversa),
                                                                  conversa.bairro, cras_id=conversa.unidade_id))
        return [resposta + (f"\n\n{bloco}" if bloco else "")]
    if conversa.estado in ("AGUARDANDO_RELATO", "RELATO_NOVAMENTE", "RETORNO"):
        conversa.estado = "AGUARDANDO_RELATO"
        return [resposta + " " + catalogo.texto("pedir_relato", conversa.unidade_id)]
    return [resposta]


async def _precisa_bairro(session: AsyncSession, conversa: Conversa) -> bool:
    """Número único para a cidade: o bairro define o CRAS e, com ele, o fluxo que vale daqui em diante."""
    return bool(catalogo.opcoes_fluxo(None)["perguntar_bairro"]) and not conversa.bairro and await unidades.tem_cras_ativo(session)


def _so_cumprimento(texto: str, classificacao: Optional[dict]) -> bool:
    """"oi", "bom dia". Com IA, ela diz; sem IA, mensagem curta em que o modelo não achou necessidade."""
    tipo = (classificacao or {}).get("tipo_mensagem")
    if tipo:
        return tipo == "cumprimento"
    return len(texto.split()) < 4 and (classificacao or {}).get("categoria") == NAO_IDENTIFICADO


def _marcar_confirmada(conversa: Conversa, confirmada: bool) -> None:
    conversa.classificacao = {**(conversa.classificacao or {}), "confirmada": confirmada}


async def _mostrar_caminho(session: AsyncSession, conversa: Conversa, telefone: str, secundarias: Sequence[str] = ()) -> List[str]:
    u = conversa.unidade_id
    opcoes = catalogo.opcoes_fluxo(u)
    if not opcoes["mostrar_outras_necessidades"]:
        secundarias = ()
    locais = await unidades.locais_para(session, conversa.categoria_escolhida, _ponto(conversa), conversa.bairro,
                                       cras_id=conversa.unidade_id)
    bloco = unidades.bloco_locais(locais)
    if locais and not _ponto(conversa):
        bloco += "\n\nSe mandar sua *localização* (📎 → Localização), eu indico os lugares mais perto de você."
    modo = opcoes["contato"]
    caminho = caminho_completo(conversa.categoria_escolhida, secundarias, locais=bloco, unidade=u, perguntar_contato=modo == "perguntar")
    if modo == "perguntar":
        conversa.estado = "AGUARDANDO_CONTATO"
        return [caminho]
    conversa.estado = "FINALIZADA"
    if modo == "sempre":  # este CRAS quer todo caso na fila, sem perguntar
        await _registrar_triagem(session, conversa, telefone)
        return [caminho, catalogo.texto("contato_confirmado", u)]
    return [caminho, catalogo.texto("fim_sem_contato", u)]


async def _passo(session: AsyncSession, conversa: Conversa, telefone: str, texto: str,
                localizacao: Optional[geo.Ponto] = None) -> List[str]:
    estado = conversa.estado
    texto_norm = normalizar(texto).strip(" .!?")

    def t(chave: str) -> str:  # texto do CRAS da pessoa (ou da secretaria)
        return catalogo.texto(chave, conversa.unidade_id)

    # Comandos que valem em qualquer etapa. Vêm antes da regra de violência porque só casam com a
    # mensagem inteira (nunca com um relato) e o modelo pode confundir "apagar meus dados" com ameaça.
    if texto_norm in COMANDO_APAGAR and estado != "CONFIRMAR_APAGAR":
        conversa.estado = "CONFIRMAR_APAGAR"
        return [t("apagar_confirmar")]
    if texto_norm in COMANDO_RECOMECAR:
        if not conversa.consentiu_em:
            conversa.estado = "AGUARDANDO_CONSENTIMENTO"
            return [t("boas_vindas")]
        conversa.estado, conversa.tentativas = "AGUARDANDO_RELATO", 0
        conversa.relato = conversa.categoria_sugerida = conversa.categoria_escolhida = None
        conversa.classificacao = None
        return [t("pedir_relato")]

    # Classifica o mesmo texto que será gravado (sem CPF/telefone/e-mail). A IA só lê a mensagem depois do
    # aceite e nas etapas em que a pessoa conta a situação; no resto, basta o modelo local (e a regra de violência).
    if not texto:
        classificacao = None
    elif conversa.consentiu_em and estado in ETAPAS_DE_RELATO:
        classificacao = await SocialClassifierService.classificar(anonimizar_texto(texto))
    else:
        classificacao = SocialClassifierService.classify_relato(anonimizar_texto(texto))

    # Violência interrompe qualquer etapa (exceto respostas curtas de menu, como "1" ou "sim")
    if classificacao and classificacao["categoria"] == VIOLENCIA and _resposta(texto) is None and not texto.isdigit():
        return await _emergencia(session, conversa, telefone, texto)

    if estado == "CONFIRMAR_APAGAR":
        resposta = _resposta(texto)
        if resposta is True:
            mantido = await _apagar_dados(session, conversa)
            aviso = ("\n\nO pedido de ajuda urgente que você enviou continua com a equipe até o atendimento, "
                     "para a sua proteção.") if mantido else ""
            return [t("apagar_feito") + aviso]
        if resposta is False:
            conversa.estado = "FINALIZADA"
            return [t("apagar_cancelado")]
        return ["Responda *1* para apagar seus dados ou *2* para manter."]

    if estado == "NOVA":
        conversa.estado = "AGUARDANDO_CONSENTIMENTO"
        return [t("boas_vindas")]

    if estado == "RETORNO":
        if texto_norm in AGRADECIMENTO:
            conversa.estado = "FINALIZADA"
            return [t("agradecimento")]
        if await _precisa_bairro(session, conversa):
            conversa.estado = "AGUARDANDO_BAIRRO"
            return [t("pedir_bairro")]
        conversa.estado = "AGUARDANDO_RELATO"
        if _so_cumprimento(texto, classificacao):  # "oi", "bom dia": cumprimenta e pede o relato
            return [t("retorno")]
        estado = "AGUARDANDO_RELATO"  # mensagem longa já é o relato

    if estado == "AGUARDANDO_CONSENTIMENTO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.consentiu_em = agora()
            if await _precisa_bairro(session, conversa):
                conversa.estado = "AGUARDANDO_BAIRRO"
                return [t("pedir_bairro")]
            conversa.estado = "AGUARDANDO_RELATO"
            return [t("pedir_relato")]
        if resposta is False:
            conversa.consentiu_em = None
            conversa.estado = "FINALIZADA"
            return [t("sem_consentimento")]
        return ["Para continuar, responda *1* (Sim, concordo) ou *2* (Não)."]

    if estado == "AGUARDANDO_BAIRRO":
        # A pessoa escolhe se e como diz onde mora: pino, CEP ou bairro (aceitos a qualquer momento desta etapa).
        # Pino, CEP ou bairro escolhem o CRAS; "4", "não sei" ou bairro não encontrado seguem com o padrão da secretaria.
        if not localizacao and texto_norm in OPCOES_LOCAL:
            return [t(OPCOES_LOCAL[texto_norm])]
        prefixo, endereco = "", None
        cep = None if localizacao else geo.cep_no_texto(texto)
        if cep:
            achado = await geo.buscar_cep(cep)
            if not achado or not achado["bairro"] or normalizar(achado["localidade"]) != normalizar(settings.CIDADE):
                return [t("cep_nao_encontrado")]
            bairro = achado["bairro"]
            endereco = f"{achado['logradouro']}, {bairro}" if achado["logradouro"] else None
            prefixo = f"Pelo CEP, seu bairro é *{bairro}*.\n"
        elif localizacao or texto_norm == "4" or texto_norm in unidades.NAO_SEI:
            bairro = None
        else:
            bairro = texto.strip()[:80]
        unidade = await _definir_local(session, conversa, bairro, localizacao, endereco)
        conversa.estado = "AGUARDANDO_RELATO"
        if unidade:
            pela_lista = bool(bairro) and await unidades.cras_do_bairro(session, bairro) is not None
            chave = "cras_indicado" if pela_lista else "cras_mais_perto"
            return [prefixo + t(chave).replace("{cras}", unidade.nome) + "\n\n" + t("pedir_relato")]
        if cep:
            return [prefixo + "\n" + t("pedir_relato")]
        if bairro:
            return [t("bairro_nao_encontrado") + "\n\n" + t("pedir_relato")]
        return [t("pedir_relato")]

    if estado in ("AGUARDANDO_RELATO", "RELATO_NOVAMENTE"):
        opcoes = catalogo.opcoes_fluxo(conversa.unidade_id)
        if classificacao.get("tipo_mensagem") == "cumprimento":
            return [t("relato_curto")]
        # Mensagem curta só pede detalhes se não deu para entender ("estou com fome" já basta)
        if (opcoes["pedir_detalhes_relato_curto"] and len(texto.split()) < 4 and conversa.tentativas == 0
                and classificacao["categoria"] == NAO_IDENTIFICADO):
            conversa.tentativas = 1
            return [t("relato_curto")]
        conversa.relato = anonimizar_texto(texto)
        conversa.classificacao = classificacao
        if classificacao["categoria"] == NAO_IDENTIFICADO:
            if estado == "AGUARDANDO_RELATO" and not opcoes["menu_na_primeira_falha"]:
                conversa.estado = "RELATO_NOVAMENTE"
                return [t("nao_entendi")]
            conversa.estado = "AGUARDANDO_CORRECAO"
            introducao = t("nao_entendi_de_novo") if estado == "RELATO_NOVAMENTE" else \
                "Não consegui entender com segurança. Escolha o assunto pelo número:"
            return [_menu_categorias(introducao)]
        conversa.categoria_sugerida = classificacao["categoria"]
        secundarias = classificacao.get("necessidades_secundarias", [])
        if not opcoes["confirmar_necessidade"]:  # este CRAS dispensa a confirmação
            conversa.categoria_escolhida = conversa.categoria_sugerida
            _marcar_confirmada(conversa, False)
            return await _mostrar_caminho(session, conversa, telefone, secundarias)
        conversa.estado = "AGUARDANDO_CONFIRMACAO"
        assuntos = [NOMES_CATEGORIA[classificacao["categoria"]]] + [
            NOMES_CATEGORIA[c] for c in _secundarias_por_prioridade(classificacao["categoria"], secundarias)
        ] if opcoes["mostrar_outras_necessidades"] else [NOMES_CATEGORIA[classificacao["categoria"]]]
        resumo = classificacao.get("resumo_ia")
        if resumo:  # a IA resumiu a situação com as palavras dela
            return [f"Entendi que {resumo}. Posso te orientar sobre *{' e '.join(assuntos)}*. Está certo?\n*1* - Sim\n*2* - Não"]
        return [f"Entendi que você precisa de ajuda com *{' e '.join(assuntos)}*. Está certo?\n*1* - Sim\n*2* - Não"]

    if estado == "AGUARDANDO_CONFIRMACAO":
        resposta = _resposta(texto)
        if resposta is True:
            conversa.categoria_escolhida = conversa.categoria_sugerida
            _marcar_confirmada(conversa, True)
            secundarias = (conversa.classificacao or {}).get("necessidades_secundarias", [])
            return await _mostrar_caminho(session, conversa, telefone, secundarias)
        if resposta is False:
            conversa.estado = "AGUARDANDO_CORRECAO"
            return [_menu_categorias()]
        return ["Responda *1* se eu entendi certo ou *2* se não."]

    if estado == "AGUARDANDO_CORRECAO":
        if texto.isdigit() and int(texto) == OPCAO_NENHUM:
            conversa.estado = "FINALIZADA"
            return [t("nao_entendi")]
        if texto.isdigit() and 1 <= int(texto) <= len(CATEGORIAS):
            escolhida = CATEGORIAS[int(texto) - 1]
            if escolhida == VIOLENCIA:
                return await _emergencia(session, conversa, telefone, conversa.relato or texto)
            conversa.categoria_escolhida = escolhida
            _marcar_confirmada(conversa, True)
            return await _mostrar_caminho(session, conversa, telefone)
        return [f"Responda só com o número, de 1 a {OPCAO_NENHUM}."]

    if estado == "AGUARDANDO_CONTATO":
        resposta = _resposta(texto)
        if resposta is None:
            return ["Responda *1* para enviar seu pedido ao CRAS ou *2* para não enviar (o CRAS não fica sabendo do seu caso)."]
        conversa.estado = "FINALIZADA"
        if resposta is False:
            return [t("contato_recusado")]
        await _registrar_triagem(session, conversa, telefone)
        return [t("contato_confirmado")]

    conversa.estado = "AGUARDANDO_CONSENTIMENTO"
    return [t("boas_vindas")]
