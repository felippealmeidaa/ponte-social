"""
Base de serviços e textos do bot editáveis pelo CRAS (tela "Serviços e mensagens").

Ficam no banco; este módulo mantém uma cópia em memória para leitura rápida (o classificador
e o fluxo da conversa leem daqui) e é recarregado sempre que alguém salva uma alteração.
Os valores padrão vêm de train_evaluator.KNOWLEDGE_SERVICES e de TEXTOS_PADRAO abaixo.

Cada CRAS pode personalizar respostas, textos e opções do fluxo. O que ele não personalizou vale o
padrão da secretaria (tabelas servicos_categoria, textos_bot e opcoes_fluxo["padrao"]).
"""
import copy
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OpcoesFluxo, ServicoCategoria, ServicoUnidade, TextoBot, TextoUnidade, agora, iso
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES

TEXTOS_PADRAO: Dict[str, Dict[str, str]] = {
    "boas_vindas": {
        "descricao": "Primeira mensagem: apresentação e pedido de consentimento",
        "texto": (
            "Olá! Sou o Ponte Social, um assistente de orientação da assistência social. 👋\n\n"
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
            "Você também pode procurar o *CREAS* da sua cidade, que atende casos de violência.\n\n"
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
        "descricao": "Áudio que não deu para entender (sem fala clara, longo demais ou transcrição indisponível)",
        "texto": "Não consegui entender seu áudio. 🙏 Pode me contar por escrito ou mandar outro áudio mais curto, falando perto do celular?",
    },
    "agendamento_confirmado": {
        "descricao": "Quando a equipe marca o atendimento ({quando}, {local} e {cras} são trocados)",
        "texto": (
            "📅 Seu atendimento foi marcado para *{quando}*, no *{local}*. Leve os documentos da lista. "
            "Se não puder ir, responda aqui para remarcar."
        ),
    },
    "agenda_salvar": {
        "descricao": "Logo depois da confirmação do atendimento: link para salvar na agenda do celular ({link} é trocado)",
        "texto": "📲 Quer salvar na agenda do celular? Toque no link e confirme:\n{link}",
    },
    "agendamento_lembrete": {
        "descricao": "Lembrete enviado na véspera do atendimento marcado ({quando} e {local} são trocados)",
        "texto": "🔔 Lembrete: seu atendimento é *{quando}*, no *{local}*. Leve os documentos da lista. Se não puder ir, responda aqui.",
    },
    "agendamento_cancelado": {
        "descricao": "Quando a equipe desmarca o atendimento",
        "texto": "Seu atendimento marcado para *{quando}* foi desmarcado. A equipe vai entrar em contato para combinar outro horário.",
    },
    "oferecer_documentos": {
        "descricao": "Depois de o pedido ir ao CRAS: mandar fotos dos documentos agora ou levar pessoalmente (nunca em violência)",
        "texto": (
            "Quer adiantar seu atendimento? Você pode mandar agora, por aqui, as *fotos dos documentos* da lista. "
            "A equipe do CRAS já confere antes, e o atendimento fica mais rápido. Quem decide o benefício é sempre o profissional.\n\n"
            "🔒 As fotos ficam protegidas: só a equipe do CRAS vê, e elas são apagadas depois do atendimento.\n\n"
            "*1* - Quero mandar as fotos agora\n*2* - Prefiro levar os documentos pessoalmente"
        ),
    },
    "instrucoes_documentos": {
        "descricao": "Como tirar as fotos dos documentos ({documentos} é trocado pela lista do caso)",
        "texto": (
            "Ótimo! Para a equipe conseguir ler, cada foto precisa:\n"
            "• mostrar o *documento inteiro*, com as quatro bordas aparecendo\n"
            "• estar *nítida*: dá para ler todas as letras e números\n"
            "• ter *boa luz*, sem sombra e sem reflexo do flash\n"
            "• ser *uma foto por documento* (e do verso também, quando tiver)\n"
            "• ser do *documento original* (PDF também vale)\n\n"
            "Apoie o documento numa mesa, segure o celular reto por cima e mande as fotos aqui, uma de cada vez. "
            "Quando terminar, escreva *pronto*.\n\n*Documentos da lista:*\n{documentos}"
        ),
    },
    "documento_recebido": {
        "descricao": "Cada foto de documento aceita ({n} é o número do documento)",
        "texto": "Recebi o documento {n} ✅ Pode mandar o próximo, ou escreva *pronto* quando terminar.",
    },
    "documento_problema": {
        "descricao": "Foto recusada na conferência automática ({problema} explica o que corrigir)",
        "texto": "Essa foto não ficou boa para leitura: {problema}. 😕 Tire de novo, por favor.",
    },
    "documentos_recebidos": {
        "descricao": "A pessoa terminou de mandar as fotos ({quantidade} vira \"1 documento\" ou \"3 documentos\")",
        "texto": (
            "Pronto! ✅ Recebi {quantidade} e anexei ao seu pedido. A equipe do CRAS vai conferir e entrar em contato "
            "por este número. Guarde os originais: eles podem ser pedidos no atendimento."
        ),
    },
    "documentos_nenhum": {
        "descricao": "A pessoa escreveu \"pronto\" sem ter mandado nenhuma foto",
        "texto": "Você ainda não mandou nenhuma foto. Mande as fotos aqui, ou escreva *2* se preferir levar os documentos pessoalmente.",
    },
    "documentos_lembrete": {
        "descricao": "Mensagem de texto enquanto o bot espera as fotos",
        "texto": "Estou esperando as fotos dos documentos 📷. Mande aqui, uma de cada vez, e escreva *pronto* quando terminar. Se preferir levar pessoalmente, escreva *2*.",
    },
    "documentos_presencial": {
        "descricao": "A pessoa prefere levar os documentos pessoalmente",
        "texto": "Tudo bem! Leve os documentos originais da lista quando for ao CRAS. A equipe vai entrar em contato por este número.",
    },
    "documentos_limite": {
        "descricao": "A pessoa chegou ao máximo de fotos ({max})",
        "texto": "Recebi o máximo de {max} documentos ✅ Eles foram anexados ao seu pedido. Se faltou algum, leve no dia do atendimento.",
    },
    "documento_refazer": {
        "descricao": "A equipe pediu uma nova foto pelo painel ({motivo} é trocado)",
        "texto": "A equipe do CRAS conferiu seus documentos e pediu uma nova foto: {motivo}. Mande a foto aqui e escreva *pronto* quando terminar.",
    },
    "imagem_fora_de_hora": {
        "descricao": "Foto mandada fora da etapa de documentos (não é guardada)",
        "texto": (
            "Recebi uma imagem 📷, mas, para proteger seus dados, eu só guardo fotos de documentos depois que o seu pedido "
            "é enviado ao CRAS. Me conte, por escrito, o que está acontecendo."
        ),
    },
    "oferecer_ajuda": {
        "descricao": "Quando a pessoa diz \"não entendi\": oferece áudio ou uma explicação mais simples",
        "texto": "Sem problema! Como fica melhor para você?\n*1* - Ouvir em áudio 🔊\n*2* - Ler uma explicação mais simples e detalhada",
    },
    "audio_enviando": {
        "descricao": "A pessoa pediu áudio: vai junto com a mensagem falada",
        "texto": "Certo! Te mando em áudio. 🔊",
    },
    "audio_indisponivel": {
        "descricao": "A pessoa pediu áudio, mas não deu para gravar agora: o bot explica por escrito",
        "texto": "Não consegui gravar o áudio agora. 😕 Vou explicar por escrito:",
    },
    "repetir_com_calma": {
        "descricao": "Quando não dá para gerar uma explicação nova: o bot repete a última mensagem",
        "texto": "Vou repetir com calma:",
    },
    "situacao_sem_pedido": {
        "descricao": "Resposta a \"meu pedido\" quando a pessoa não tem pedido enviado ao CRAS",
        "texto": "Não encontrei pedido seu enviado ao CRAS por este número. Se quiser, me conte o que está acontecendo e eu te oriento.",
    },
    "situacao_pedido": {
        "descricao": "Resposta a \"meu pedido\" ({situacao}, {assunto}, {cras} e {data} são trocados)",
        "texto": "Seu pedido sobre *{assunto}*, enviado em {data}, está *{situacao}* no *{cras}*. Se precisar falar com a equipe, é só responder aqui.",
    },
    "situacao_protegida": {
        "descricao": "Resposta a \"meu pedido\" em caso de violência: sem detalhes, para a segurança da pessoa",
        "texto": "Seu pedido está com a equipe da assistência social. Se estiver em perigo agora, ligue *190*. Para falar com a equipe, procure o CRAS ou o CREAS.",
    },
    "pedir_avaliacao": {
        "descricao": "Enviada logo depois do aviso de caso concluído: nota de 1 a 5",
        "texto": "Para melhorar o atendimento: de *1* a *5*, quanto essa ajuda foi útil para você? (*1* = nada, *5* = muito)",
    },
    "avaliacao_obrigado": {
        "descricao": "Depois que a pessoa dá a nota de 1 a 5",
        "texto": "Obrigado pela resposta! 💚 Se precisar de novo, é só mandar uma mensagem.",
    },
    "acompanhamento": {
        "descricao": "Enviada dias depois a quem não quis contato do CRAS ({assunto} é trocado). Nunca em violência.",
        "texto": (
            "Oi! Há alguns dias eu te orientei sobre *{assunto}*. Você conseguiu ir ao CRAS?\n"
            "*1* - Sim, já fui\n*2* - Ainda não. Quero que o CRAS entre em contato comigo\n*3* - Não preciso mais"
        ),
    },
    "acompanhamento_foi": {
        "descricao": "Resposta a quem disse que já foi ao CRAS",
        "texto": "Que bom! 💚 Se precisar de novo, é só mandar uma mensagem.",
    },
    "acompanhamento_nao_precisa": {
        "descricao": "Resposta a quem disse que não precisa mais",
        "texto": "Tudo bem! Se precisar, é só mandar uma mensagem. Cuide-se. 💚",
    },
    "aviso_em_atendimento": {
        "descricao": "Aviso pelo WhatsApp quando a equipe começa a atender o caso ({cras} e {assunto} são trocados). Nunca vai em caso de violência.",
        "texto": "Olá! A equipe do *{cras}* recebeu seu pedido sobre *{assunto}* e já está cuidando dele. Se precisar, é só responder aqui.",
    },
    "aviso_concluido": {
        "descricao": "Aviso pelo WhatsApp quando o caso é concluído ({cras} e {assunto} são trocados). Nunca vai em caso de violência.",
        "texto": "Seu atendimento sobre *{assunto}* no *{cras}* foi concluído. Se precisar de novo, é só mandar uma mensagem. 💚",
    },
    "contato_confirmado": {
        "descricao": "A pessoa pediu contato do CRAS (triagem entra na fila)",
        "texto": (
            "Pronto! ✅ Sua solicitação foi enviada para a equipe do CRAS, que vai entrar em contato por este número. "
            "Enquanto isso, separe os documentos da lista acima."
        ),
    },
    "contato_recusado": {
        "descricao": "A pessoa não quis contato do CRAS (nada entra na fila)",
        "texto": (
            "Tudo bem! Seu pedido *não foi enviado* ao CRAS. Para ser atendido, vá ao CRAS com os documentos da lista acima. "
            "Se mudar de ideia, é só mandar uma nova mensagem. Cuide-se. 💚"
        ),
    },
    "pedir_bairro": {
        "descricao": "Pergunta se a pessoa quer dizer onde mora e como: localização, CEP ou bairro (só quando há CRAS cadastrado)",
        "texto": (
            "Para eu indicar o CRAS e os lugares mais perto de você, como prefere me dizer onde mora? "
            "Só uso isso para achar os lugares; seu endereço não fica guardado.\n"
            "*1* - Enviar minha localização\n"
            "*2* - Digitar meu CEP\n"
            "*3* - Digitar meu bairro\n"
            "*4* - Prefiro não informar"
        ),
    },
    "pedir_localizacao": {
        "descricao": "A pessoa escolheu enviar a localização: explica como mandar pelo WhatsApp",
        "texto": (
            "Toque no 📎 (ou no ➕ do iPhone) → *Localização* → *Enviar localização atual*.\n"
            "Se mudar de ideia, digite o CEP, o bairro ou *4* para seguir sem informar."
        ),
    },
    "pedir_cep": {
        "descricao": "A pessoa escolheu informar o CEP",
        "texto": "Digite seu CEP, só os números (por exemplo: 75000000).",
    },
    "pedir_nome_bairro": {
        "descricao": "A pessoa escolheu informar o bairro",
        "texto": "Digite o nome do seu bairro.",
    },
    "cep_nao_encontrado": {
        "descricao": "CEP inexistente, de outra cidade ou sem bairro (o bot continua esperando a localização)",
        "texto": (
            "Não encontrei esse CEP aqui na cidade. Confira os números e mande de novo, "
            "ou responda *3* para digitar o bairro ou *4* para seguir sem informar."
        ),
    },
    "bairro_nao_encontrado": {
        "descricao": "Bairro não encontrado no mapa nem na lista de bairros dos CRAS",
        "texto": (
            "Não encontrei esse bairro. Se quiser, mande sua *localização* (📎 → Localização) a qualquer momento. "
            "Você também pode confirmar o seu CRAS pelo Disque Social 121."
        ),
    },
    "cras_mais_perto": {
        "descricao": "Depois da localização ou do bairro, quando o CRAS foi escolhido pela distância ({cras} é trocado pelo nome)",
        "texto": "O CRAS mais perto de você é o *{cras}*.",
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
    "fim_sem_contato": {
        "descricao": "Fim do caminho quando o CRAS não oferece retorno de contato pelo bot (nada entra na fila)",
        "texto": (
            "Atenção: esta conversa *não envia seu pedido* ao CRAS. Para ser atendido, vá ao CRAS com os documentos da lista. "
            "Se precisar, é só mandar uma mensagem. 💚"
        ),
    },
    "cras_indicado": {
        "descricao": "Depois do bairro: indica o CRAS de referência ({cras} é trocado pelo nome)",
        "texto": "Seu CRAS de referência é o *{cras}*.",
    },
    "atendente_assumiu": {
        "descricao": "Enviada quando um atendente assume a conversa pelo painel",
        "texto": "Olá! Agora quem fala com você é uma pessoa da equipe da Assistência Social. 🙂",
    },
}

# Padrões de versões anteriores. Banco que ainda guarda um deles sem edição passa para o padrão atual.
TEXTOS_ANTIGOS: Dict[str, tuple] = {
    "boas_vindas": (
        "Olá! Sou o assistente de orientação da Assistência Social de Anápolis. 👋\n\n"
        "Eu ajudo a descobrir *qual serviço procurar, quais documentos levar e onde ir*. "
        "Sou só uma orientação: *não decido quem tem direito a benefício* — isso é feito pelos profissionais do CRAS.\n\n"
        "Vou usar o que você me contar para te orientar e, *sem identificar você*, para melhorar este serviço. "
        "Não escreva nome, CPF ou endereço. A qualquer momento, envie *apagar* para excluir seus dados.\n\n"
        "Você concorda?\n*1* - Sim, concordo\n*2* - Não",
    ),
    "emergencia": (
        "🚨 *Sua segurança vem primeiro.*\n\n"
        "Se estiver em perigo agora, ligue *190* (Polícia).\n"
        "Violência contra a mulher: *Ligue 180*.\n"
        "Crianças, idosos ou pessoas com deficiência: *Disque 100*.\n"
        "Você também pode procurar o *CREAS* de Anápolis, que atende casos de violência.\n\n"
        "Sua mensagem foi enviada com prioridade para a equipe da assistência social.",
    ),
    "contato_recusado": ("Tudo bem! Se precisar de novo, é só mandar uma mensagem. Cuide-se. 💚",),
    "fim_sem_contato": ("Procure o CRAS com os documentos da lista. Se precisar, é só mandar uma mensagem. 💚",),
    "audio": ("Por enquanto eu só consigo ler mensagens escritas. Pode me contar por texto? 🙏",),
    "documentos_recebidos": (
        "Pronto! ✅ Seus {n} documento(s) foram anexados ao seu pedido. A equipe do CRAS vai conferir e entrar em contato "
        "por este número. Guarde os originais: eles podem ser pedidos no atendimento.",
    ),
    "pedir_bairro": (
        "Para eu indicar o CRAS mais perto de você, em qual *bairro* você mora? Se não souber, responda *não sei*.",
        "Para eu indicar os lugares mais perto de você, mande sua *localização* "
        "(no WhatsApp: 📎 → Localização → Enviar localização atual) ou digite o nome do seu *bairro*. "
        "Se não souber, responda *não sei*.",
    ),
    "bairro_nao_encontrado": ("Não encontrei o CRAS do seu bairro na minha lista. Você pode confirmar o seu CRAS pelo Disque Social 121.",),
}

CAMPOS_SERVICO = ("titulo", "servicos", "documentos", "local_atendimento", "contato_util")
OBRIGATORIOS_EMERGENCIA = ("190", "180", "100")
PADRAO = "padrao"

# Opções do fluxo que cada CRAS pode mudar. Violência, aceite (LGPD), "apagar" e "recomeçar" não estão
# aqui de propósito: são travados e valem sempre.
OPCOES_PADRAO: Dict[str, object] = {
    "perguntar_bairro": True,            # só na secretaria: é o bairro que define o CRAS
    "confirmar_necessidade": True,
    "pedir_detalhes_relato_curto": True,
    "menu_na_primeira_falha": False,
    "mostrar_outras_necessidades": True,
    "contato": "perguntar",              # perguntar | sempre | nunca
    "perguntar_depois": True,            # quem não quis contato recebe "conseguiu ir ao CRAS?" dias depois
    "alerta_urgente_min": 10,            # painel: caso de violência sem atendimento há mais que isso acende o alerta
    # Gestão › Alertas. Em violência nenhuma mensagem automática vai pelo WhatsApp, com qualquer valor daqui.
    "alerta_fila_horas": 48,             # painel: caso comum aguardando há mais que isso acende outro aviso (0 = desligado)
    "aviso_em_atendimento": True,        # "a equipe recebeu seu pedido" ao marcar Em atendimento
    "aviso_concluido": True,             # "seu atendimento foi concluído"
    "pedir_avaliacao": True,             # nota de 1 a 5 junto do aviso de concluído
    "aviso_agendamento": True,           # confirmação (com link da agenda) e desmarcação do atendimento marcado
    "lembrete_vespera": True,            # lembrete antes do atendimento marcado
    "lembrete_horas": 20,                # quantas horas antes vai o lembrete
    "retorno_dias": 3,                   # dias até o "conseguiu ir ao CRAS?" (perguntar_depois)
    "modo_demonstracao": False,          # Gestão › Demonstração: indicadores, mapa e relatório contam os exemplos
    # Gestão › Unidades: feriado municipal, ponto facultativo, recesso ([{"data": "2026-12-24", "nome": "..."}]);
    # os nacionais já estão em services/funcionamento.py
    "dias_sem_atendimento": [],
}
# chave: (mínimo, máximo, unidade mostrada no erro)
LIMITES_NUMERICOS = {
    "alerta_urgente_min": (1, 240, "minutos"),
    "alerta_fila_horas": (0, 720, "horas (0 desliga)"),
    "lembrete_horas": (2, 72, "horas"),
    "retorno_dias": (1, 30, "dias"),
}
VALORES_CONTATO = ("perguntar", "sempre", "nunca")
SO_SECRETARIA = {"perguntar_bairro", "modo_demonstracao", "dias_sem_atendimento"}

_servicos: Dict[str, dict] = copy.deepcopy(KNOWLEDGE_SERVICES)
_textos: Dict[str, str] = {k: v["texto"] for k, v in TEXTOS_PADRAO.items()}
_servicos_unidade: Dict[str, Dict[str, dict]] = {}
_textos_unidade: Dict[str, Dict[str, str]] = {}
_opcoes: Dict[str, dict] = {}


def servico(categoria: str, unidade: Optional[str] = None) -> dict:
    """Dados de serviço da categoria (do CRAS, se personalizado). 'urgencia' vem sempre do padrão."""
    proprio = _servicos_unidade.get(unidade or "", {}).get(categoria)
    dados = dict(proprio or _servicos.get(categoria) or KNOWLEDGE_SERVICES[categoria])
    dados["urgencia"] = KNOWLEDGE_SERVICES[categoria]["urgencia"]
    return dados


def texto(chave: str, unidade: Optional[str] = None) -> str:
    proprio = _textos_unidade.get(unidade or "", {}).get(chave)
    return proprio or _textos.get(chave, TEXTOS_PADRAO[chave]["texto"])


def opcoes_fluxo(unidade: Optional[str] = None) -> dict:
    """Padrão do sistema ← secretaria ← CRAS. Opções só da secretaria não são herdadas do CRAS."""
    resultado = {**OPCOES_PADRAO, **_opcoes.get(PADRAO, {})}
    if unidade:
        resultado.update({k: v for k, v in _opcoes.get(unidade, {}).items() if k not in SO_SECRETARIA})
    return resultado


def validar_opcoes(opcoes: dict, unidade: Optional[str]) -> Optional[str]:
    for chave, valor in opcoes.items():
        if chave not in OPCOES_PADRAO:
            return f"Opção desconhecida: {chave}."
        if chave in SO_SECRETARIA and unidade:
            return "Essa opção só pode ser mudada no padrão da secretaria."
        if chave == "dias_sem_atendimento":
            erro = _validar_dias(valor)
            if erro:
                return erro
        elif chave == "contato":
            if valor not in VALORES_CONTATO:
                return "Contato deve ser: perguntar, sempre ou nunca."
        elif chave in LIMITES_NUMERICOS:
            minimo, maximo, unidade_medida = LIMITES_NUMERICOS[chave]
            if isinstance(valor, bool) or not isinstance(valor, int) or not minimo <= valor <= maximo:
                return f"Use um número inteiro de {minimo} a {maximo} {unidade_medida}."
        elif not isinstance(valor, bool):
            return f"A opção {chave} deve ser ligada ou desligada."
    return None


def _validar_dias(valor) -> Optional[str]:
    if not isinstance(valor, list) or len(valor) > 60:
        return "Envie a lista de dias sem atendimento (no máximo 60)."
    for d in valor:
        if not isinstance(d, dict) or not isinstance(d.get("nome", ""), str) or len(d.get("nome", "")) > 80:
            return "Cada dia precisa de data e de um nome curto."
        try:
            date.fromisoformat(str(d.get("data", "")))
        except ValueError:
            return "Data inválida na lista de dias sem atendimento."
    return None


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
    if chave in ("cras_indicado", "cras_mais_perto") and "{cras}" not in valor:
        return "O texto precisa conter {cras}, que é trocado pelo nome do CRAS."
    return None


def _limpar_lista(itens: List[str]) -> List[str]:
    return [i.strip() for i in itens if i and i.strip()]


def _iso(valor) -> Optional[str]:
    return iso(valor) if isinstance(valor, datetime) else (valor.isoformat() if valor else None)


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
        elif textos[chave].texto in TEXTOS_ANTIGOS.get(chave, ()):
            textos[chave].texto = padrao["texto"]
    await session.commit()

    for categoria, linha in salvos.items():
        if categoria in KNOWLEDGE_SERVICES:
            _servicos[categoria] = {c: getattr(linha, c) for c in CAMPOS_SERVICO}
    for chave, linha in textos.items():
        if chave in TEXTOS_PADRAO:
            _textos[chave] = linha.texto

    _servicos_unidade.clear()
    for linha in (await session.execute(select(ServicoUnidade))).scalars():
        if linha.categoria in KNOWLEDGE_SERVICES:
            _servicos_unidade.setdefault(linha.unidade_id, {})[linha.categoria] = {c: getattr(linha, c) for c in CAMPOS_SERVICO}
    _textos_unidade.clear()
    for linha in (await session.execute(select(TextoUnidade))).scalars():
        if linha.chave in TEXTOS_PADRAO:
            _textos_unidade.setdefault(linha.unidade_id, {})[linha.chave] = linha.texto
    _opcoes.clear()
    for linha in (await session.execute(select(OpcoesFluxo))).scalars():
        _opcoes[linha.unidade_id] = dict(linha.opcoes or {})


# ------------------------------------------------------------------------------
# Respostas por necessidade
# ------------------------------------------------------------------------------
async def listar_servicos(session: AsyncSession, unidade: Optional[str] = None) -> List[dict]:
    padroes = {s.categoria: s for s in (await session.execute(select(ServicoCategoria))).scalars()}
    proprios = {}
    if unidade:
        proprios = {s.categoria: s for s in (await session.execute(
            select(ServicoUnidade).where(ServicoUnidade.unidade_id == unidade))).scalars()}
    saida = []
    for categoria in KNOWLEDGE_SERVICES:
        linha = proprios.get(categoria) or padroes.get(categoria)
        saida.append({
            "categoria": categoria,
            **servico(categoria, unidade),
            "personalizado": categoria in proprios,
            "fonte": (linha.fonte or "") if linha else "",
            "verificado_em": _iso(linha.verificado_em) if linha else None,
            "atualizado_em": _iso(linha.atualizado_em) if linha else None,
            "atualizado_por": linha.atualizado_por if linha else None,
        })
    return saida


def _aplicar_servico(linha, dados: dict, usuario: str) -> None:
    linha.titulo = dados["titulo"].strip()
    linha.servicos = _limpar_lista(dados["servicos"])
    linha.documentos = _limpar_lista(dados["documentos"])
    linha.local_atendimento = dados["local_atendimento"].strip()
    linha.contato_util = dados["contato_util"].strip()
    linha.fonte = (dados.get("fonte") or "").strip()
    linha.verificado_em = dados.get("verificado_em")
    linha.atualizado_em, linha.atualizado_por = agora(), usuario


async def salvar_servico(session: AsyncSession, categoria: str, dados: dict, usuario: str, unidade: Optional[str] = None) -> dict:
    if unidade:
        linha = await session.get(ServicoUnidade, (unidade, categoria))
        if linha is None:
            linha = ServicoUnidade(unidade_id=unidade, categoria=categoria)
            session.add(linha)
    else:
        linha = await session.get(ServicoCategoria, categoria)
    _aplicar_servico(linha, dados, usuario)
    await session.commit()
    await carregar(session)
    return servico(categoria, unidade)


async def restaurar_servico(session: AsyncSession, categoria: str, usuario: str, unidade: Optional[str] = None) -> dict:
    """No CRAS: apaga a personalização e volta ao padrão da secretaria.
    Na secretaria: volta ao texto original do sistema (fonte e data em branco, porque não foram conferidas)."""
    if unidade:
        await session.execute(delete(ServicoUnidade).where(ServicoUnidade.unidade_id == unidade, ServicoUnidade.categoria == categoria))
        await session.commit()
        await carregar(session)
        return servico(categoria, unidade)
    return await salvar_servico(session, categoria, copy.deepcopy(KNOWLEDGE_SERVICES[categoria]), usuario)


# ------------------------------------------------------------------------------
# Textos da conversa
# ------------------------------------------------------------------------------
async def listar_textos(session: AsyncSession, unidade: Optional[str] = None) -> List[dict]:
    padroes = {t.chave: t for t in (await session.execute(select(TextoBot))).scalars()}
    proprios = {}
    if unidade:
        proprios = {t.chave: t for t in (await session.execute(
            select(TextoUnidade).where(TextoUnidade.unidade_id == unidade))).scalars()}
    saida = []
    for chave, padrao in TEXTOS_PADRAO.items():
        linha = proprios.get(chave) or padroes.get(chave)
        saida.append({
            "chave": chave,
            "descricao": padrao["descricao"],
            "texto": texto(chave, unidade),
            # "Voltar ao padrão": no CRAS é o texto da secretaria; na secretaria, o original do sistema
            "padrao": texto(chave) if unidade else padrao["texto"],
            "personalizado": chave in proprios,
            "atualizado_em": _iso(linha.atualizado_em) if linha else None,
            "atualizado_por": linha.atualizado_por if linha else None,
        })
    return saida


async def salvar_texto(session: AsyncSession, chave: str, valor: str, usuario: str, unidade: Optional[str] = None) -> str:
    if unidade:
        linha = await session.get(TextoUnidade, (unidade, chave))
        if linha is None:
            linha = TextoUnidade(unidade_id=unidade, chave=chave)
            session.add(linha)
    else:
        linha = await session.get(TextoBot, chave)
    linha.texto = valor.strip()
    linha.atualizado_em, linha.atualizado_por = agora(), usuario
    await session.commit()
    await carregar(session)
    return texto(chave, unidade)


async def restaurar_texto(session: AsyncSession, chave: str, usuario: str, unidade: Optional[str] = None) -> str:
    if unidade:
        await session.execute(delete(TextoUnidade).where(TextoUnidade.unidade_id == unidade, TextoUnidade.chave == chave))
        await session.commit()
        await carregar(session)
        return texto(chave, unidade)
    return await salvar_texto(session, chave, TEXTOS_PADRAO[chave]["texto"], usuario)


# ------------------------------------------------------------------------------
# Opções do fluxo
# ------------------------------------------------------------------------------
async def ler_opcoes(session: AsyncSession, unidade: Optional[str] = None) -> dict:
    linha = await session.get(OpcoesFluxo, unidade or PADRAO)
    return {
        "opcoes": opcoes_fluxo(unidade),
        "personalizadas": sorted((linha.opcoes or {}).keys()) if linha and unidade else [],
        "so_secretaria": sorted(SO_SECRETARIA),
        "atualizado_em": _iso(linha.atualizado_em) if linha else None,
        "atualizado_por": linha.atualizado_por if linha else None,
    }


async def salvar_opcoes(session: AsyncSession, opcoes: dict, usuario: str, unidade: Optional[str] = None) -> dict:
    """Mescla as opções enviadas com as já salvas. No CRAS, valor igual ao da secretaria deixa de ser personalização."""
    chave = unidade or PADRAO
    linha = await session.get(OpcoesFluxo, chave)
    if linha is None:
        linha = OpcoesFluxo(unidade_id=chave, opcoes={})
        session.add(linha)
    novas = {**(linha.opcoes or {}), **opcoes}
    if unidade:
        base = opcoes_fluxo(None)
        novas = {k: v for k, v in novas.items() if base.get(k) != v}
    linha.opcoes = novas
    linha.atualizado_em, linha.atualizado_por = agora(), usuario
    await session.commit()
    await carregar(session)
    return await ler_opcoes(session, unidade)
