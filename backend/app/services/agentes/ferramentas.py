"""
Ferramentas que um agente pode usar (Configurações › Agentes). Todas são de CONSULTA: leem a base de conhecimento,
o catálogo de respostas por necessidade e a rede de lugares. Nenhuma mexe em caso, agenda ou manda mensagem, porque
isso agiria sobre pessoas reais a partir de um texto gerado por IA.

Cada ferramenta tem a declaração que vai para o Gemini (nome, descrição, parâmetros) e a função que executa.
O agente só pode chamar as ferramentas marcadas para ele: quem confere é o servidor, não a IA.
"""
from typing import Any, Awaitable, Callable, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import catalogo, unidades
from app.services.ml.train_evaluator import CATEGORIAS
from app.services.rag import documentos as base

NOMES_CATEGORIA = {
    "renda_beneficio": "renda e benefícios", "cadastro_atualizacao": "Cadastro Único", "moradia": "moradia",
    "documentacao": "documentos", "alimentacao": "alimentação", "pessoa_idosa_pcd": "pessoa idosa ou com deficiência",
    "trabalho_renda": "trabalho e cursos", "violencia_protecao": "violência ou ameaça",
}

Executor = Callable[[AsyncSession, Dict[str, Any]], Awaitable[Dict[str, Any]]]


async def _buscar_base(session: AsyncSession, args: Dict[str, Any]) -> Dict[str, Any]:
    pergunta = str(args.get("pergunta") or "").strip()
    if len(pergunta) < 3:
        return {"erro": "pergunta vazia"}
    # sem reescrita nem reordenação aqui: o próprio agente já formula a pergunta (economiza chamadas ao Gemini)
    r = await base.buscar(session, pergunta[:500], k=4, usar_reescrita=False, usar_reordenacao=False)
    return {"trechos": [{"documento": x["documento"]["titulo"], "secao": x["trecho"]["secao"], "texto": x["trecho"]["conteudo"][:1500],
                         "nota": x["nota"]} for x in r["resultados"]]}


async def _servicos(session: AsyncSession, args: Dict[str, Any]) -> Dict[str, Any]:
    categoria = str(args.get("necessidade") or "")
    if categoria not in CATEGORIAS:
        return {"erro": f"necessidade desconhecida; use uma de: {', '.join(CATEGORIAS)}"}
    s = catalogo.servico(categoria)
    return {"necessidade": NOMES_CATEGORIA.get(categoria, categoria), "titulo": s.get("titulo"), "servicos": s.get("servicos", []),
            "documentos": s.get("documentos", []), "onde": s.get("local_atendimento"), "contato": s.get("contato_util")}


def _lugar(u, km=None) -> Dict[str, Any]:
    return {"nome": u.nome, "tipo": u.tipo, "endereco": u.endereco, "horario": u.horario, "telefone": u.telefone,
            **({"distancia_km": round(km, 1)} if km is not None else {})}


async def _cras_do_bairro(session: AsyncSession, args: Dict[str, Any]) -> Dict[str, Any]:
    bairro = str(args.get("bairro") or "").strip()
    if not bairro:
        return {"erro": "informe o bairro"}
    u = await unidades.cras_do_bairro(session, bairro)
    return {"cras": _lugar(u)} if u else {"cras": None, "aviso": "bairro não está na lista de nenhum CRAS cadastrado"}


async def _lugares(session: AsyncSession, args: Dict[str, Any]) -> Dict[str, Any]:
    categoria = str(args.get("necessidade") or "")
    if categoria not in CATEGORIAS:
        return {"erro": f"necessidade desconhecida; use uma de: {', '.join(CATEGORIAS)}"}
    locais = await unidades.locais_para(session, categoria, bairro=str(args.get("bairro") or "") or None)
    return {"lugares": [_lugar(u, km) for u, km in locais]}


FERRAMENTAS: Dict[str, Dict[str, Any]] = {
    "buscar_base_conhecimento": {
        "rotulo": "Buscar na base de conhecimento",
        "descricao": "Procura trechos de leis, decretos e manuais enviados pela coordenação.",
        "declaracao": {
            "description": "Busca trechos de leis, decretos e manuais da assistência social do município. Use para requisitos, "
                           "valores, prazos e regras. Responda só com o que os trechos dizem.",
            "parameters": {"type": "OBJECT", "properties": {"pergunta": {"type": "STRING", "description": "o que procurar, em português"}},
                           "required": ["pergunta"]},
        },
        "executar": _buscar_base,
    },
    "servicos_da_necessidade": {
        "rotulo": "Resposta do CRAS para uma necessidade",
        "descricao": "Serviços, documentos para levar e onde ir, como está em Serviços e mensagens.",
        "declaracao": {
            "description": "Devolve o que o CRAS orienta para uma necessidade: serviços, documentos para levar, onde ir e contato.",
            "parameters": {"type": "OBJECT", "properties": {"necessidade": {"type": "STRING", "enum": CATEGORIAS}}, "required": ["necessidade"]},
        },
        "executar": _servicos,
    },
    "cras_do_bairro": {
        "rotulo": "CRAS de um bairro",
        "descricao": "Qual CRAS atende o bairro, com endereço, horário e telefone.",
        "declaracao": {
            "description": "Encontra o CRAS de referência de um bairro do município, com endereço, horário e telefone.",
            "parameters": {"type": "OBJECT", "properties": {"bairro": {"type": "STRING"}}, "required": ["bairro"]},
        },
        "executar": _cras_do_bairro,
    },
    "lugares_da_rede": {
        "rotulo": "Lugares da rede para uma necessidade",
        "descricao": "CRAS, Centro POP, restaurante popular e outros que atendem a necessidade.",
        "declaracao": {
            "description": "Lista os lugares da rede que atendem uma necessidade (CRAS, Centro POP, restaurante popular...), "
                           "com endereço, horário e telefone; com o bairro, os mais próximos primeiro.",
            "parameters": {"type": "OBJECT", "properties": {"necessidade": {"type": "STRING", "enum": CATEGORIAS},
                                                            "bairro": {"type": "STRING"}}, "required": ["necessidade"]},
        },
        "executar": _lugares,
    },
}


def catalogo_para_painel() -> List[Dict[str, str]]:
    return [{"id": k, "rotulo": v["rotulo"], "descricao": v["descricao"]} for k, v in FERRAMENTAS.items()]


def declaracoes(permitidas: List[str]) -> List[Dict[str, Any]]:
    return [{"name": k, **FERRAMENTAS[k]["declaracao"]} for k in permitidas if k in FERRAMENTAS]
