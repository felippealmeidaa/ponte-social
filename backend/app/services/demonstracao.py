"""
Modo demonstração (Gestão › Demonstração): casos fictícios para apresentar o sistema (banca, reunião com o CRAS)
sem misturar com os casos reais.

- Todo caso de exemplo tem canal "demo" e nome "Exemplo fictício". Nunca recebe mensagem pelo WhatsApp (os avisos
  só saem no canal whatsapp) e nunca entra no treino da IA (retreino.exemplos_reais ignora "demo").
- Fila, contadores, indicadores, temas, mapa e relatório só mostram os exemplos com o modo ligado (opção
  "modo_demonstracao", da secretaria); desligado, o painel volta a ter só os casos reais. Ligado, o topo mostra
  a etiqueta "Demonstração".
- "Apagar exemplos" remove só canal "demo": caso real nunca é apagado por aqui.
"""
import random
import uuid
from datetime import timedelta
from typing import Dict, List

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Triagem, UnidadeAtendimento, agora
from app.services import catalogo
from app.services.ml.train_evaluator import VIOLENCIA
from app.services.triagens import _prioridade

CANAL = "demo"
NOME = "Exemplo fictício"
MAX_EXEMPLOS = 300

# Relatos inventados para a demonstração (não vêm de pessoa nenhuma). Escritos como chegam no WhatsApp.
RELATOS: Dict[str, List[str]] = {
    "alimentacao": [
        "to sem comida em casa desde ontem, tenho dois filhos pequenos",
        "precisava de uma cesta basica, o dinheiro acabou antes do fim do mes",
        "onde consigo leite pro meu bebe? nao to conseguindo comprar",
        "minha mae idosa ta passando fome, moro longe e nao consigo ajudar",
    ],
    "renda_beneficio": [
        "perdi o emprego e nao tenho renda nenhuma, como faço pra receber algum auxilio",
        "queria saber se tenho direito ao bolsa familia, moro sozinha com 3 filhos",
        "a conta de luz ta muito alta, ouvi falar de tarifa social",
        "meu marido foi embora e fiquei sem dinheiro pra nada",
    ],
    "cadastro_atualizacao": [
        "preciso atualizar o cadunico porque meu filho nasceu",
        "disseram que meu cadastro ta desatualizado e vai bloquear o beneficio",
        "como faço pra me inscrever no cadastro unico?",
        "mudei de endereço e preciso mudar no cadastro",
    ],
    "moradia": [
        "o dono da casa pediu o imovel e tenho ate o fim do mes pra sair",
        "a chuva derrubou parte do telhado, to com as crianças na casa da vizinha",
        "to dormindo na rua faz uma semana, preciso de um lugar",
        "nao consigo mais pagar o aluguel, tem aluguel social?",
    ],
    "documentacao": [
        "perdi minha identidade e preciso tirar outra",
        "meu filho nunca foi registrado, como faço a certidao?",
        "roubaram minha bolsa com todos os documentos",
        "preciso da segunda via da certidao de nascimento e nao tenho dinheiro",
    ],
    "pessoa_idosa_pcd": [
        "meu pai tem 70 anos e fica sozinho o dia todo, tem algum lugar pra ele?",
        "minha filha é autista, como tiro a carteirinha?",
        "minha mae teve avc e precisa de cadeira de rodas",
        "queria saber do bpc pro meu irmao que tem deficiencia",
    ],
    "trabalho_renda": [
        "to procurando emprego, tem algum curso de graça?",
        "faço salgados e queria virar mei pra vender mais",
        "meu filho de 16 anos quer ser jovem aprendiz",
        "sei costurar, tem projeto pra ajudar a montar um negocio?",
    ],
    VIOLENCIA: [
        "meu ex fica me ameaçando e apareceu na porta de casa de noite",
        "a vizinha bate nas crianças todo dia, da pra ouvir os gritos",
        "minha avo ta sendo maltratada pelo cuidador",
    ],
}
# Peso de cada necessidade no total (soma 1): parecido com o que um CRAS recebe
PESOS = {"alimentacao": 0.2, "renda_beneficio": 0.2, "cadastro_atualizacao": 0.17, "documentacao": 0.12, "moradia": 0.1,
         "pessoa_idosa_pcd": 0.08, "trabalho_renda": 0.08, VIOLENCIA: 0.05}
BAIRROS = ["Vila Jaiara", "Recanto do Sol", "Jundiaí", "Centro", "Bairro de Lourdes", "Residencial Morumbi", "Vila Santana",
           "Jardim Alvorada", "Vila Norte", "Santa Isabel", "Filostro Machado", "Residencial Copacabana"]


def _status(categoria: str, sorteio: random.Random) -> str:
    if categoria == VIOLENCIA:
        return sorteio.choice(["URGENTE_CREAS", "EM_ATENDIMENTO", "ENCAMINHADO_CREAS", "ENCAMINHADO_CREAS"])
    return sorteio.choices(["PENDENTE", "EM_ATENDIMENTO", "CONCLUIDO", "ARQUIVADO"], weights=[30, 25, 40, 5])[0]


def ligado() -> bool:
    return bool(catalogo.opcoes_fluxo(None)["modo_demonstracao"])


async def contar(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(Triagem).where(Triagem.canal == CANAL))).scalar_one()


async def gerar(session: AsyncSession, quantos: int = 60, dias: int = 30, semente: int = None) -> int:
    """Cria 'quantos' casos de exemplo espalhados nos últimos 'dias'. Devolve quantos foram criados."""
    ja = await contar(session)
    quantos = max(0, min(quantos, MAX_EXEMPLOS - ja))
    sorteio = random.Random(semente)
    cras = [u.id for u in (await session.execute(
        select(UnidadeAtendimento).where(UnidadeAtendimento.tipo == "CRAS", UnidadeAtendimento.ativo.is_(True)))).scalars()]
    agora_ = agora()
    categorias, pesos = list(PESOS), list(PESOS.values())
    for _ in range(quantos):
        categoria = sorteio.choices(categorias, weights=pesos)[0]
        info = catalogo.servico(categoria)
        # Dentro do período (com folga de 1 h): um caso de "30 dias e 3 horas" ficaria fora dos indicadores de 30 dias
        criado = agora_ - timedelta(hours=sorteio.uniform(0, dias * 24 - 1))
        status = _status(categoria, sorteio)
        atendido = None
        if status != "PENDENTE" and status != "URGENTE_CREAS":
            # Violência é atendida em minutos; o resto em horas ou poucos dias
            espera = timedelta(minutes=sorteio.uniform(4, 40)) if categoria == VIOLENCIA else timedelta(hours=sorteio.uniform(2, 60))
            atendido = min(criado + espera, agora_)
        t = Triagem(
            id=f"trg-{uuid.uuid4().hex[:8]}", criado_em=criado, atualizado_em=atendido or criado, canal=CANAL,
            nome_cidadao=NOME, bairro=sorteio.choice(BAIRROS), cidade="Anápolis",
            relato_anonimizado=sorteio.choice(RELATOS[categoria]), categoria=categoria, categoria_modelo=categoria,
            categoria_confirmada_pelo_cidadao=categoria != VIOLENCIA, necessidades_secundarias=[],
            titulo_encaminhamento=info["titulo"], prioridade=_prioridade(categoria), confianca=round(sorteio.uniform(0.62, 0.97), 2),
            metodo_decisao="Exemplo de demonstração", servicos_recomendados=info["servicos"],
            documentos_necessarios=info["documentos"],
            unidade_id=None if categoria == VIOLENCIA or not cras else sorteio.choice(cras),
            status=status, consentiu_uso_para_treino=False, atendido_em=atendido,
            responsavel_nome="Equipe (exemplo)" if atendido else None,
            avaliacao=sorteio.choices([5, 4, 3, 2], weights=[50, 30, 15, 5])[0] if status == "CONCLUIDO" and sorteio.random() < 0.6 else None,
        )
        if status == "EM_ATENDIMENTO" and categoria != VIOLENCIA and sorteio.random() < 0.5:
            dia = (agora_ + timedelta(days=sorteio.randint(1, 10))).replace(hour=12 + sorteio.choice([0, 1, 2, 4]), minute=0, second=0, microsecond=0)
            t.agendado_para, t.agendado_em, t.agendado_por = dia, atendido or criado, "Equipe (exemplo)"
            t.agendado_local = "CRAS (exemplo)"
        session.add(t)
    await session.commit()
    return quantos


async def apagar(session: AsyncSession) -> int:
    """Remove só os casos de exemplo (canal 'demo')."""
    res = await session.execute(delete(Triagem).where(Triagem.canal == CANAL))
    await session.commit()
    return res.rowcount or 0


def filtro_casos(consulta, modo_ligado: bool):
    """Indicadores, mapa e relatório: sem o modo, os exemplos ficam de fora."""
    return consulta if modo_ligado else consulta.where(Triagem.canal != CANAL)
