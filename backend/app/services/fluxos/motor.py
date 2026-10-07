"""
Motor de fluxos (Configurações › Fluxos): etapas ligadas em grafo sem ciclo, rodadas só no simulador do painel.

Tipos de etapa e suas saídas:
- inicio, mensagem, agente, ferramenta → "proximo"
- pergunta → "opcao:1" … "opcao:N" e "outra" (resposta fora das opções)
- condicao → "sim" e "nao"
- fila, fim → nenhuma (encerram)

Antes de salvar, validar() recusa: mais de um início, etapa sem caminho a partir do início, saída sem ligação,
ligação para etapa que não existe, ciclo (A → B → A) e fluxo com mais de MAX_ETAPAS etapas.
Ao rodar, no máximo MAX_PASSOS etapas por mensagem; toda mensagem passa pela regra de violência, que encerra o
fluxo com a mensagem de emergência do bot. "fila" no simulador só registra que o caso entraria na fila.
"""
import json
import re
import unicodedata
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentePersonalizado
from app.services import catalogo
from app.services.agentes import executor as agentes
from app.services.agentes.ferramentas import FERRAMENTAS
from app.services.anonimizacao import anonimizar_texto
from app.services.ml.text_rules import detectar_violencia
from app.services.ml.train_evaluator import CATEGORIAS

TIPOS = {"inicio", "mensagem", "pergunta", "condicao", "agente", "ferramenta", "fila", "fim"}
MAX_ETAPAS = 40
MAX_PASSOS = 15
MAX_OPCOES = 9
OPERADORES = {"igual", "contem", "vazio"}
_VARIAVEL = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
_MODELO = re.compile(r"\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}")


def saidas(etapa: Dict[str, Any]) -> List[str]:
    tipo = etapa.get("tipo")
    if tipo in ("inicio", "mensagem", "agente", "ferramenta"):
        return ["proximo"]
    if tipo == "pergunta":
        return [f"opcao:{i}" for i in range(1, len(etapa.get("opcoes") or []) + 1)] + ["outra"]
    if tipo == "condicao":
        return ["sim", "nao"]
    return []


def _campos(e: Dict[str, Any], agentes_ids: Set[str]) -> List[str]:
    """Problemas nos campos de uma etapa, já em português."""
    nome, tipo, erros = e.get("titulo") or e.get("id"), e.get("tipo"), []
    if tipo in ("mensagem", "pergunta") and not str(e.get("texto") or "").strip():
        erros.append(f"“{nome}”: escreva o texto.")
    if tipo == "pergunta":
        opcoes = [str(o).strip() for o in e.get("opcoes") or []]
        if not 1 <= len(opcoes) <= MAX_OPCOES or not all(opcoes):
            erros.append(f"“{nome}”: a pergunta precisa de 1 a {MAX_OPCOES} opções, nenhuma vazia.")
    if tipo in ("pergunta", "ferramenta") and e.get("variavel") and not _VARIAVEL.match(str(e["variavel"])):
        erros.append(f"“{nome}”: o nome da resposta guardada usa só letras minúsculas, números e _ (ex.: bairro).")
    if tipo == "condicao":
        if not _VARIAVEL.match(str(e.get("variavel") or "")):
            erros.append(f"“{nome}”: escolha qual resposta guardada comparar.")
        if e.get("operador") not in OPERADORES:
            erros.append(f"“{nome}”: escolha a comparação (igual, contém ou vazia).")
        elif e.get("operador") != "vazio" and not str(e.get("valor") or "").strip():
            erros.append(f"“{nome}”: escreva o valor da comparação.")
    if tipo == "agente" and e.get("agente_id") not in agentes_ids:
        erros.append(f"“{nome}”: escolha um agente que exista.")
    if tipo == "ferramenta" and e.get("ferramenta") not in FERRAMENTAS:
        erros.append(f"“{nome}”: escolha uma ferramenta.")
    if tipo == "fila" and e.get("necessidade") and e["necessidade"] not in CATEGORIAS:
        erros.append(f"“{nome}”: necessidade desconhecida.")
    return erros


def validar(etapas: List[Dict[str, Any]], ligacoes: List[Dict[str, Any]], agentes_ids: Set[str]) -> List[str]:
    erros: List[str] = []
    if not etapas:
        return ["O fluxo está vazio."]
    if len(etapas) > MAX_ETAPAS:
        erros.append(f"O fluxo pode ter no máximo {MAX_ETAPAS} etapas.")
    por_id: Dict[str, Dict[str, Any]] = {}
    for e in etapas:
        if not e.get("id") or e["id"] in por_id:
            erros.append("Há etapas sem identificador ou repetidas.")
            continue
        if e.get("tipo") not in TIPOS:
            erros.append(f"Etapa “{e.get('titulo') or e['id']}” com tipo desconhecido.")
            continue
        por_id[e["id"]] = e
        erros += _campos(e, agentes_ids)
    inicios = [e for e in por_id.values() if e["tipo"] == "inicio"]
    if len(inicios) != 1:
        erros.append("O fluxo precisa de exatamente uma etapa de início.")

    destino: Dict[Tuple[str, str], str] = {}
    for lig in ligacoes:
        de, saida, para = lig.get("de"), lig.get("saida"), lig.get("para")
        if de not in por_id or para not in por_id:
            erros.append("Há ligação para uma etapa que não existe.")
            continue
        nome = por_id[de].get("titulo") or de
        if saida not in saidas(por_id[de]):
            erros.append(f"“{nome}”: ligação de uma saída que essa etapa não tem.")
        elif (de, saida) in destino:
            erros.append(f"“{nome}”: a mesma saída está ligada a duas etapas.")
        else:
            destino[(de, saida)] = para
        if por_id[para]["tipo"] == "inicio":
            erros.append("Nenhuma ligação pode voltar para o início.")
    for e in por_id.values():
        faltando = [s for s in saidas(e) if (e["id"], s) not in destino]
        if faltando:
            erros.append(f"“{e.get('titulo') or e['id']}”: falta ligar {_rotulo_saidas(e, faltando)}.")

    if len(inicios) == 1:
        alcancaveis, pilha = set(), [inicios[0]["id"]]
        while pilha:
            atual = pilha.pop()
            if atual in alcancaveis:
                continue
            alcancaveis.add(atual)
            pilha += [p for (d, _), p in destino.items() if d == atual]
        soltas = [por_id[i].get("titulo") or i for i in por_id if i not in alcancaveis]
        if soltas:
            erros.append(f"Etapas que nenhum caminho alcança: {', '.join(soltas)}.")
    if _tem_ciclo(destino):
        erros.append("O fluxo volta para uma etapa já passada (ciclo). Use etapas novas em vez de voltar.")
    return list(dict.fromkeys(erros))


def _rotulo_saidas(e: Dict[str, Any], faltando: List[str]) -> str:
    opcoes = e.get("opcoes") or []
    nomes = []
    for s in faltando:
        if s.startswith("opcao:"):
            i = int(s.split(":")[1])
            nomes.append(f"a opção “{opcoes[i - 1]}”" if i <= len(opcoes) else s)
        else:
            nomes.append({"proximo": "o próximo passo", "outra": "o caminho de “outra resposta”", "sim": "o “sim”", "nao": "o “não”"}.get(s, s))
    return ", ".join(nomes)


def _tem_ciclo(destino: Dict[Tuple[str, str], str]) -> bool:
    vizinhos: Dict[str, List[str]] = {}
    for (de, _), para in destino.items():
        vizinhos.setdefault(de, []).append(para)
    estado: Dict[str, int] = {}  # 1 = visitando, 2 = terminado

    def visitar(n: str) -> bool:
        estado[n] = 1
        for v in vizinhos.get(n, []):
            if estado.get(v) == 1 or (estado.get(v) is None and visitar(v)):
                return True
        estado[n] = 2
        return False

    return any(estado.get(n) is None and visitar(n) for n in list(vizinhos))


# ---------- Execução (simulador) ----------

def _normal(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


def _lugar_texto(u: Dict[str, Any]) -> str:
    detalhes = ". ".join(x for x in (u.get("endereco"), u.get("horario"), f"Tel.: {u['telefone']}" if u.get("telefone") else "") if x)
    return f"*{u.get('nome', '')}*" + (f"\n{detalhes}" if detalhes else "")


def _legivel(v: Any) -> str:
    """Resultado de consulta dentro de um texto: vira texto de WhatsApp, não JSON."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        if v.get("erro"):
            return ""
        if "servicos" in v:  # resposta do CRAS para uma necessidade
            partes = [f"*{v['titulo']}*"] if v.get("titulo") else []
            if v.get("servicos"):
                partes.append("O que procurar:\n" + "\n".join(f"• {x}" for x in v["servicos"]))
            if v.get("documentos"):
                partes.append("Documentos para levar:\n" + "\n".join(f"• {x}" for x in v["documentos"]))
            if v.get("onde"):
                partes.append(f"Onde ir: {v['onde']}")
            return "\n\n".join(p for p in partes if p)
        if "cras" in v:
            return _lugar_texto(v["cras"]) if v.get("cras") else (v.get("aviso") or "")
        if "lugares" in v:
            return "\n\n".join(_lugar_texto(u) for u in v["lugares"])
        if "trechos" in v:
            return "\n\n".join(t.get("texto", "") for t in v["trechos"][:2])
    return json.dumps(v, ensure_ascii=False)


def _preencher(texto: str, variaveis: Dict[str, Any]) -> str:
    return _MODELO.sub(lambda m: _legivel(variaveis.get(m.group(1), "")), texto or "")


def _escolha(etapa: Dict[str, Any], resposta: str) -> Tuple[str, str]:
    """Saída e valor guardado: número da opção ("2"), texto igual ou contido; senão "outra"."""
    opcoes = [str(o) for o in etapa.get("opcoes") or []]
    r = _normal(resposta)
    if r.isdigit() and 1 <= int(r) <= len(opcoes):
        return f"opcao:{int(r)}", opcoes[int(r) - 1]
    for i, o in enumerate(opcoes, start=1):
        if r == _normal(o):
            return f"opcao:{i}", o
    for i, o in enumerate(opcoes, start=1):
        if _normal(o) and _normal(o) in r:
            return f"opcao:{i}", o
    return "outra", resposta


def _condicao(etapa: Dict[str, Any], variaveis: Dict[str, Any]) -> bool:
    valor = variaveis.get(etapa.get("variavel"), "")
    valor = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    if etapa.get("operador") == "vazio":
        return not valor.strip()
    alvo = _normal(str(etapa.get("valor") or ""))
    return _normal(valor) == alvo if etapa.get("operador") == "igual" else alvo in _normal(valor)


async def executar(session: AsyncSession, etapas: List[Dict[str, Any]], ligacoes: List[Dict[str, Any]],
                   estado: Optional[Dict[str, Any]], mensagem: Optional[str]) -> Dict[str, Any]:
    """Uma rodada do simulador. Sem estado: começa pelo início. Com mensagem: responde à pergunta que está esperando."""
    por_id = {e["id"]: e for e in etapas}
    destino = {(l["de"], l["saida"]): l["para"] for l in ligacoes}
    estado = dict(estado or {})
    variaveis: Dict[str, Any] = dict(estado.get("variaveis") or {})
    respostas: List[str] = []
    eventos: List[Dict[str, Any]] = []

    def saida(texto: str):
        if texto.strip():
            respostas.append(texto.strip())

    def fim(motivo: str):
        return {"respostas": respostas, "eventos": eventos, "estado": {"etapa": None, "variaveis": variaveis, "terminado": True, "motivo": motivo}}

    if estado.get("terminado"):
        eventos.append({"tipo": "aviso", "detalhe": "O fluxo já terminou. Recomece o teste."})
        return {"respostas": respostas, "eventos": eventos, "estado": estado}

    atual: Optional[str]
    if mensagem is not None:
        texto = anonimizar_texto(mensagem.strip())[:2000]
        variaveis["mensagem"] = texto
        esperando = por_id.get(estado.get("etapa") or "")
        rota, valor = _escolha(esperando, texto) if esperando and esperando["tipo"] == "pergunta" else ("outra", texto)
        # Mesma trava do bot: resposta que escolhe uma opção passa pela regra de palavras (pega "sim, ele me bateu");
        # texto livre passa pela checagem completa (regra, modelo e IA). O modelo, sensível de propósito, marcaria
        # respostas curtas como "sim, ta faltando" — no bot ele também só lê o relato livre.
        violencia = detectar_violencia(texto) if rota.startswith("opcao:") else await agentes._violencia(texto)
        if violencia:
            saida(catalogo.texto("emergencia"))
            eventos.append({"tipo": "violencia", "detalhe": "Sinal de violência: o fluxo parou e saiu a mensagem de emergência."})
            return fim("violencia")
        if not esperando or esperando["tipo"] != "pergunta":
            eventos.append({"tipo": "aviso", "detalhe": "Nenhuma pergunta esperando resposta."})
            return {"respostas": respostas, "eventos": eventos, "estado": estado}
        variaveis["resposta"] = valor
        if esperando.get("variavel"):
            variaveis[esperando["variavel"]] = valor
        eventos.append({"etapa": esperando["id"], "tipo": "resposta", "detalhe": f"seguiu por {rota.replace('opcao:', 'opção ')}"})
        atual = destino.get((esperando["id"], rota))
    else:
        atual = next((e["id"] for e in etapas if e["tipo"] == "inicio"), None)

    for _ in range(MAX_PASSOS):
        if atual is None:
            return fim("sem_caminho")
        e = por_id[atual]
        tipo = e["tipo"]
        eventos.append({"etapa": atual, "tipo": tipo, "detalhe": e.get("titulo") or tipo})
        if tipo == "inicio":
            atual = destino.get((atual, "proximo"))
        elif tipo == "mensagem":
            saida(_preencher(e["texto"], variaveis))
            atual = destino.get((atual, "proximo"))
        elif tipo == "pergunta":
            opcoes = "\n".join(f"*{i}* - {o}" for i, o in enumerate(e.get("opcoes") or [], start=1))
            saida(f"{_preencher(e['texto'], variaveis)}\n\n{opcoes}")
            return {"respostas": respostas, "eventos": eventos, "estado": {"etapa": atual, "variaveis": variaveis, "terminado": False}}
        elif tipo == "condicao":
            sim = _condicao(e, variaveis)
            eventos[-1]["detalhe"] += f" → {'sim' if sim else 'não'}"
            atual = destino.get((atual, "sim" if sim else "nao"))
        elif tipo == "agente":
            agente = await session.get(AgentePersonalizado, e.get("agente_id") or "")
            entrada = _preencher(e.get("entrada") or "{{mensagem}}", variaveis) or variaveis.get("mensagem", "")
            if not agente or not entrada.strip():
                eventos.append({"etapa": atual, "tipo": "erro", "detalhe": "agente não encontrado ou sem texto para responder"})
                return fim("erro")
            try:
                r = await agentes.responder(session, agente, [], entrada)
            except agentes.AgenteIndisponivel as erro:
                eventos.append({"etapa": atual, "tipo": "erro", "detalhe": str(erro)})
                return fim("erro")
            saida(r["resposta"])
            variaveis["agente"] = r["resposta"]
            eventos[-1]["passos"] = r["passos"]
            if r["violencia"]:
                return fim("violencia")
            atual = destino.get((atual, "proximo"))
        elif tipo == "ferramenta":
            args = {k: _preencher(str(v), variaveis) for k, v in (e.get("argumentos") or {}).items()}
            resultado = await FERRAMENTAS[e["ferramenta"]]["executar"](session, args)
            variaveis[e.get("variavel") or "resultado"] = resultado
            eventos[-1].update({"argumentos": args, "resultado": resultado})
            atual = destino.get((atual, "proximo"))
        elif tipo == "fila":
            necessidade = e.get("necessidade") or ""
            eventos[-1]["detalhe"] = f"no WhatsApp, o caso entraria na fila do CRAS{f' como {necessidade}' if necessidade else ''} (no simulador, nenhum caso é criado)"
            saida(_preencher(e.get("texto") or "", variaveis))
            return fim("fila")
        else:  # fim
            saida(_preencher(e.get("texto") or "", variaveis))
            return fim("fim")
    eventos.append({"tipo": "erro", "detalhe": f"Mais de {MAX_PASSOS} etapas seguidas sem esperar resposta: o fluxo parou."})
    return fim("limite")
