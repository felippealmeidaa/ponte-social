"""
Base de conhecimento (Configurações › Base de conhecimento): leis, decretos, manuais e tabelas de critérios.

1. Extração: PDF (página por página), DOCX, TXT e Markdown viram texto.
2. Trechos: o texto é cortado respeitando a estrutura (título/artigo, parágrafo, lista e tabela inteiros),
   nunca no meio de uma frase; cada trecho guarda a seção e a página de onde veio.
3. Vetores: cada trecho ganha um vetor do Gemini (busca por significado). Sem chave ou sem rede, a busca usa
   só as palavras (TF-IDF) e a tela avisa.
4. Busca: nota por palavras + nota por significado, combinadas; a tela mostra as duas.

Ainda não é usada nas respostas do WhatsApp: serve para montar, corrigir e testar a base.
"""
import io
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx
import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import DocumentoBase, TrechoDocumento, iso

log = logging.getLogger(__name__)

TIPOS = {"pdf", "docx", "txt", "md"}
TAMANHO_MAX_ARQUIVO = 8_000_000
ALVO = 1000      # tamanho bom de um trecho (caracteres)
MAXIMO = 1600    # acima disso um bloco é quebrado por frases
MINIMO = 200     # abaixo disso um trecho se junta ao seguinte, se for da mesma seção
PESO_SIGNIFICADO = 0.6
CANDIDATOS = 10      # quantos trechos a IA reordena
PESO_IA = 0.7        # na nota final, quanto vale a nota da IA (o resto é a busca)


class DocumentoInvalido(ValueError):
    pass


# ---------- 1. Extração ----------

def extrair(conteudo: bytes, nome: str) -> Tuple[str, List[Tuple[int, str]], str]:
    """Devolve (tipo, páginas [(número, texto)], texto inteiro). TXT/MD/DOCX contam como página única."""
    tipo = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
    if tipo not in TIPOS:
        raise DocumentoInvalido("Envie um arquivo PDF, DOCX, TXT ou MD.")
    if not conteudo:
        raise DocumentoInvalido("O arquivo está vazio.")
    if len(conteudo) > TAMANHO_MAX_ARQUIVO:
        raise DocumentoInvalido("O arquivo pode ter no máximo 8 MB.")
    if tipo == "pdf":
        from pypdf import PdfReader
        try:
            leitor = PdfReader(io.BytesIO(conteudo))
            paginas = [(i + 1, p.extract_text() or "") for i, p in enumerate(leitor.pages)]
        except Exception as e:  # PDF corrompido ou protegido
            raise DocumentoInvalido(f"Não consegui ler o PDF ({e.__class__.__name__}).")
    elif tipo == "docx":
        from docx import Document
        try:
            doc = Document(io.BytesIO(conteudo))
        except Exception:
            raise DocumentoInvalido("Não consegui ler o DOCX.")
        linhas = [p.text for p in doc.paragraphs]
        for tabela in doc.tables:  # tabelas viram linhas com " | ", para continuarem inteiras
            linhas.append("")
            linhas += [" | ".join(c.text.strip() for c in linha.cells) for linha in tabela.rows]
        paginas = [(1, "\n".join(linhas))]
    else:
        paginas = [(1, conteudo.decode("utf-8-sig", errors="replace"))]
    texto = "\n\n".join(t for _, t in paginas).strip()
    if len(texto) < 40:
        raise DocumentoInvalido("Não encontrei texto no arquivo. PDF escaneado (só imagem) precisa passar por OCR antes.")
    return tipo, paginas, texto


# ---------- 2. Trechos ----------

_TITULO = re.compile(
    r"^(#{1,6}\s+.+|(?:cap[íi]tulo|se[çc][ãa]o|t[íi]tulo|anexo)\s+[\divxlc]+.*|\d+(?:\.\d+)*\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ].{0,90})$",
    re.IGNORECASE,
)
# Artigo de lei: é conteúdo (não título), mas começa trecho novo e dá nome à seção ("Art. 3º")
_ARTIGO = re.compile(r"^((?:art\.?|artigo)\s*\d+\s*[ºo°]?)", re.IGNORECASE)
_LISTA = re.compile(r"^\s*(?:[-•*]|\d+[.)]|[a-z][.)]|[IVXLC]+\s*[-–])\s+", re.IGNORECASE)


def _tipo_linha(linha: str) -> str:
    t = linha.strip()
    if not t:
        return "vazia"
    if "|" in t and t.count("|") >= 2 or "\t" in t:
        return "tabela"
    if _ARTIGO.match(t):
        return "artigo"
    if _LISTA.match(t):
        return "lista"
    if (_TITULO.match(t) or (t.isupper() and len(t) <= 90)) and len(t) <= 140 and not t.endswith((",", ";")):
        return "titulo"
    return "texto"


def _blocos(paginas: Sequence[Tuple[int, str]]) -> List[Dict[str, Any]]:
    """Agrupa linhas em blocos estruturais: título, parágrafo, lista inteira ou tabela inteira."""
    blocos: List[Dict[str, Any]] = []
    for pagina, texto in paginas:
        atual: Optional[Dict[str, Any]] = None
        for linha in texto.replace("\r", "").split("\n"):
            tipo = _tipo_linha(linha)
            if tipo == "vazia":
                atual = None
                continue
            if tipo == "titulo":
                blocos.append({"tipo": "titulo", "texto": linha.strip().lstrip("#").strip(), "pagina": pagina})
                atual = None
                continue
            if tipo == "artigo":
                atual = {"tipo": "texto", "texto": linha.strip(), "pagina": pagina,
                         "artigo": _ARTIGO.match(linha.strip()).group(1).strip()}
                blocos.append(atual)
                continue
            # lista e tabela continuam no mesmo bloco; parágrafo quebrado pelo PDF também
            if atual and (atual["tipo"] == tipo or (atual["tipo"] in ("lista", "texto") and tipo == "texto" and not atual["texto"].endswith((".", ":", ";")))):
                atual["texto"] += ("\n" if tipo in ("lista", "tabela") else " ") + linha.strip()
            else:
                atual = {"tipo": tipo, "texto": linha.strip(), "pagina": pagina}
                blocos.append(atual)
    return blocos


def _quebrar_frases(texto: str) -> List[str]:
    frases = re.split(r"(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])", texto)
    partes, atual = [], ""
    for f in frases:
        if atual and len(atual) + len(f) + 1 > ALVO:
            partes.append(atual)
            atual = f
        else:
            atual = f"{atual} {f}".strip()
    if atual:
        partes.append(atual)
    return partes


def fatiar(paginas: Sequence[Tuple[int, str]]) -> List[Dict[str, Any]]:
    """Trechos de ~1000 caracteres; um título começa trecho novo; nada é cortado no meio de frase, lista ou tabela."""
    trechos: List[Dict[str, Any]] = []
    capitulo, secao, atual = "", "", None

    def fechar():
        nonlocal atual
        if atual and atual["conteudo"].strip():
            atual.pop("artigos", None)
            trechos.append(atual)
        atual = None

    for b in _blocos(paginas):
        if b["tipo"] == "titulo":
            if atual and len(atual["conteudo"]) >= MINIMO:
                fechar()
            capitulo = secao = b["texto"][:200]
            if atual is None:
                atual = {"conteudo": b["texto"], "secao": secao, "pagina": b["pagina"]}
            else:
                atual["conteudo"] += "\n\n" + b["texto"]
            continue
        if b.get("artigo"):
            if atual and len(atual["conteudo"]) >= MINIMO:
                fechar()
            # um trecho curto pode reunir mais de um artigo: o nome lista todos ("Art. 3º, Art. 4º")
            artigos = (atual.get("artigos", []) if atual else []) + [b["artigo"]]
            secao = (f"{capitulo} · {', '.join(artigos)}" if capitulo else ", ".join(artigos))[:200]
            if atual is not None:
                atual["secao"], atual["artigos"] = secao, artigos
            else:
                atual = {"conteudo": "", "secao": secao, "pagina": b["pagina"], "artigos": artigos}
        pedacos = [b["texto"]] if len(b["texto"]) <= MAXIMO or b["tipo"] in ("lista", "tabela") else _quebrar_frases(b["texto"])
        for pedaco in pedacos:
            if atual and len(atual["conteudo"]) + len(pedaco) > ALVO and len(atual["conteudo"]) >= MINIMO:
                fechar()
            if atual is None:
                atual = {"conteudo": pedaco, "secao": secao, "pagina": b["pagina"]}
            else:
                atual["conteudo"] = f"{atual['conteudo']}\n\n{pedaco}" if atual["conteudo"] else pedaco
    fechar()
    return trechos


# ---------- 3. Vetores ----------

async def vetorizar(textos: List[str], consulta: bool = False) -> Optional[List[List[float]]]:
    """Vetores do Gemini, em lotes de 50. None sem chave ou se a API falhar (a busca usa só as palavras)."""
    if not settings.GEMINI_API_KEY or not textos:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_EMBED_MODEL}:batchEmbedContents"
    vetores: List[List[float]] = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for i in range(0, len(textos), 50):
                lote = textos[i:i + 50]
                corpo = {"requests": [{
                    "model": f"models/{settings.GEMINI_EMBED_MODEL}",
                    "content": {"parts": [{"text": t[:6000]}]},
                    "taskType": "RETRIEVAL_QUERY" if consulta else "RETRIEVAL_DOCUMENT",
                    "outputDimensionality": settings.EMBED_DIMENSOES,
                } for t in lote]}
                r = await client.post(url, json=corpo, headers={"x-goog-api-key": settings.GEMINI_API_KEY})
                if r.status_code != 200:
                    log.warning("Gemini embeddings respondeu %s: %s", r.status_code, r.text[:200])
                    return None
                vetores += [e["values"] for e in r.json().get("embeddings", [])]
    except Exception as e:
        log.warning("Falha ao gerar vetores: %s", e)
        return None
    return vetores if len(vetores) == len(textos) else None


def _para_vetor(t: TrechoDocumento) -> str:
    return f"{t.secao}\n{t.conteudo}" if t.secao and not t.conteudo.startswith(t.secao) else t.conteudo


async def vetorizar_trechos(trechos: List[TrechoDocumento]) -> bool:
    vetores = await vetorizar([_para_vetor(t) for t in trechos])
    for t, v in zip(trechos, vetores or [None] * len(trechos)):
        t.embedding, t.modelo_embedding = v, (settings.GEMINI_EMBED_MODEL if v else None)
    return vetores is not None


# ---------- Documento: criar, nova versão, editar trechos ----------

# Documento oficial traz telefone, CEP e e-mail de órgãos públicos, que são informação útil: ficam.
# Só número de pessoa (CPF/NIS de exemplo num manual) é apagado antes de ir para a IA.
_CPF_NIS = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")


def _limpo(texto: str) -> str:
    return _CPF_NIS.sub("[cpf]", texto)


async def _gravar_trechos(session: AsyncSession, doc: DocumentoBase, paginas, autor: str) -> int:
    await session.execute(delete(TrechoDocumento).where(TrechoDocumento.documento_id == doc.id))
    novos = [TrechoDocumento(id=uuid.uuid4().hex[:16], documento_id=doc.id, indice=i, conteudo=_limpo(t["conteudo"]),
                             secao=t["secao"], pagina=t["pagina"], atualizado_por=autor)
             for i, t in enumerate(fatiar(paginas))]
    await vetorizar_trechos(novos)
    session.add_all(novos)
    return len(novos)


async def criar(session: AsyncSession, conteudo: bytes, nome: str, titulo: str, fonte: str, tags: List[str], autor: str) -> DocumentoBase:
    tipo, paginas, texto = extrair(conteudo, nome)
    doc = DocumentoBase(id=uuid.uuid4().hex[:16], titulo=(titulo or nome).strip()[:200], nome_arquivo=nome[:200], tipo=tipo,
                        fonte=fonte.strip(), tags=tags, texto=_limpo(texto), criado_por=autor)
    session.add(doc)
    await _gravar_trechos(session, doc, paginas, autor)
    await session.commit()
    return doc


async def nova_versao(session: AsyncSession, doc: DocumentoBase, conteudo: bytes, nome: str, autor: str) -> DocumentoBase:
    """Troca o arquivo: o texto e os trechos são refeitos (edições manuais da versão anterior se perdem)."""
    tipo, paginas, texto = extrair(conteudo, nome)
    doc.tipo, doc.nome_arquivo, doc.texto = tipo, nome[:200], _limpo(texto)
    doc.versao += 1
    doc.atualizado_em, doc.atualizado_por = datetime.now(timezone.utc), autor
    await _gravar_trechos(session, doc, paginas, autor)
    await session.commit()
    return doc


async def trechos_de(session: AsyncSession, documento_id: str) -> List[TrechoDocumento]:
    q = select(TrechoDocumento).where(TrechoDocumento.documento_id == documento_id).order_by(TrechoDocumento.indice)
    return list((await session.execute(q)).scalars())


async def _renumerar(session: AsyncSession, documento_id: str) -> None:
    for i, t in enumerate(await trechos_de(session, documento_id)):
        t.indice = i


def _marcar(t: TrechoDocumento, autor: str) -> None:
    t.editado_manualmente = True
    t.atualizado_em, t.atualizado_por = datetime.now(timezone.utc), autor


async def editar_trecho(session: AsyncSession, t: TrechoDocumento, conteudo: str, autor: str) -> TrechoDocumento:
    conteudo = conteudo.strip()
    if len(conteudo) < 20:
        raise DocumentoInvalido("O trecho precisa ter pelo menos 20 caracteres. Para tirar um trecho, junte-o ao vizinho.")
    t.conteudo = _limpo(conteudo)
    _marcar(t, autor)
    await vetorizar_trechos([t])  # o vetor antigo descreve o texto antigo: refaz na hora
    await session.commit()
    return t


async def juntar_com_proximo(session: AsyncSession, t: TrechoDocumento, autor: str) -> TrechoDocumento:
    lista = await trechos_de(session, t.documento_id)
    pos = next(i for i, x in enumerate(lista) if x.id == t.id)
    if pos + 1 >= len(lista):
        raise DocumentoInvalido("Este é o último trecho: não há próximo para juntar.")
    prox = lista[pos + 1]
    t.conteudo = f"{t.conteudo}\n\n{prox.conteudo}"
    _marcar(t, autor)
    await session.delete(prox)
    await session.flush()
    await _renumerar(session, t.documento_id)
    await vetorizar_trechos([t])
    await session.commit()
    return t


async def dividir(session: AsyncSession, t: TrechoDocumento, posicao: int, autor: str) -> List[TrechoDocumento]:
    antes, depois = t.conteudo[:posicao].strip(), t.conteudo[posicao:].strip()
    if len(antes) < 20 or len(depois) < 20:
        raise DocumentoInvalido("Divida num ponto que deixe pelo menos 20 caracteres de cada lado.")
    for x in await trechos_de(session, t.documento_id):
        if x.indice > t.indice:
            x.indice += 1
    t.conteudo = antes
    _marcar(t, autor)
    novo = TrechoDocumento(id=uuid.uuid4().hex[:16], documento_id=t.documento_id, indice=t.indice + 1, conteudo=depois,
                           secao=t.secao, pagina=t.pagina, editado_manualmente=True, atualizado_por=autor,
                           atualizado_em=datetime.now(timezone.utc))
    session.add(novo)
    await vetorizar_trechos([t, novo])
    await session.commit()
    return [t, novo]


# ---------- 4. Busca ----------

def _cosseno(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a @ b) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b) + 1e-9)


async def buscar(session: AsyncSession, pergunta: str, k: int = 5, usar_reescrita: bool = True,
                 usar_reordenacao: bool = True) -> Dict[str, Any]:
    """Reescrita (opcional) → recuperação dos 10 melhores por palavras e significado → reordenação pela IA (opcional).
    Notas de 0 a 1. A resposta diz quais etapas rodaram, para a tela mostrar."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    from app.services.rag import consulta as etapas

    trechos = list((await session.execute(select(TrechoDocumento))).scalars())
    if not trechos:
        return {"modo": "vazio", "reescrita": None, "reordenado": False, "resultados": []}
    docs = {d.id: d for d in (await session.execute(select(DocumentoBase))).scalars()}

    # 1. Reescrita: busca com a pergunta original E com a reescrita; vale a maior nota de cada trecho
    reescrita = await etapas.reescrever(pergunta) if usar_reescrita else None
    consultas = [pergunta] + ([f"{reescrita['consulta']} {' '.join(reescrita['termos'])}"] if reescrita else [])

    # 2. Recuperação
    textos = [_para_vetor(t) for t in trechos]
    tfidf = TfidfVectorizer(strip_accents="unicode", lowercase=True, analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
    matriz = tfidf.fit_transform(textos + consultas)
    palavras = (matriz[:len(textos)] @ matriz[len(textos):].T).toarray().max(axis=1)

    significado = None
    com_vetor = [i for i, t in enumerate(trechos) if t.embedding]
    if com_vetor:
        vetores = await vetorizar(consultas, consulta=True)
        if vetores:
            m = np.array([trechos[i].embedding for i in com_vetor], dtype=float)
            significado = np.zeros(len(trechos))
            significado[com_vetor] = np.clip(np.max([_cosseno(m, np.array(v, dtype=float)) for v in vetores], axis=0), 0, 1)

    if significado is not None:
        recuperacao, modo = PESO_SIGNIFICADO * significado + (1 - PESO_SIGNIFICADO) * palavras, "palavras e significado"
    else:
        recuperacao, modo = palavras, "só palavras"
    candidatos = [i for i in np.argsort(-recuperacao)[:CANDIDATOS] if recuperacao[i] > 0]

    # 3. Reordenação: a IA lê os candidatos e diz quanto cada um responde à pergunta
    notas_ia = await etapas.reordenar(pergunta, [{"id": trechos[i].id, "texto": textos[i]} for i in candidatos]) if usar_reordenacao and candidatos else None
    if notas_ia is not None:
        final = {i: PESO_IA * notas_ia.get(trechos[i].id, 0.0) + (1 - PESO_IA) * recuperacao[i] for i in candidatos}
    else:
        final = {i: float(recuperacao[i]) for i in candidatos}
    ordem = sorted(candidatos, key=lambda i: -final[i])[:k]
    return {
        "modo": modo,
        "reescrita": reescrita,
        "reordenado": notas_ia is not None,
        "trechos_sem_vetor": len(trechos) - len(com_vetor),
        "resultados": [{
            "trecho": para_dict(trechos[i]),
            "documento": {"id": trechos[i].documento_id, "titulo": docs[trechos[i].documento_id].titulo if trechos[i].documento_id in docs else ""},
            "nota": round(float(final[i]), 3),
            "nota_busca": round(float(recuperacao[i]), 3),
            "nota_palavras": round(float(palavras[i]), 3),
            "nota_significado": round(float(significado[i]), 3) if significado is not None else None,
            "nota_ia": round(notas_ia[trechos[i].id], 3) if notas_ia and trechos[i].id in notas_ia else None,
        } for i in ordem],
    }


# ---------- Saída para o painel ----------

def para_dict(t: TrechoDocumento) -> Dict[str, Any]:
    return {"id": t.id, "indice": t.indice, "conteudo": t.conteudo, "secao": t.secao, "pagina": t.pagina,
            "editado_manualmente": t.editado_manualmente, "tem_vetor": bool(t.embedding),
            "atualizado_em": iso(t.atualizado_em), "atualizado_por": t.atualizado_por}


def doc_dict(d: DocumentoBase, trechos: Sequence[TrechoDocumento]) -> Dict[str, Any]:
    return {"id": d.id, "titulo": d.titulo, "nome_arquivo": d.nome_arquivo, "tipo": d.tipo, "fonte": d.fonte, "tags": d.tags or [],
            "versao": d.versao, "criado_em": iso(d.criado_em), "criado_por": d.criado_por,
            "atualizado_em": iso(d.atualizado_em), "atualizado_por": d.atualizado_por,
            "trechos": len(trechos), "com_vetor": sum(1 for t in trechos if t.embedding),
            "editados": sum(1 for t in trechos if t.editado_manualmente)}
