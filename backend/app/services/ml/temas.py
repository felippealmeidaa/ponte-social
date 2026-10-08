"""
Temas emergentes (Indicadores › Temas): agrupa sozinho os relatos parecidos do período (sem rótulo, não supervisionado)
para a equipe ver assuntos que se repetem, inclusive os que não cabem bem nas 8 necessidades.

TF-IDF das palavras e pares de palavras + K-means sobre os textos únicos (relato repetido conta várias vezes, mas não
puxa o grupo); o número de grupos é o de melhor silhueta (de 2 a 12). Cada tema
mostra as palavras que mais o definem, quantos casos, as necessidades que o modelo deu a eles e dois exemplos
(já anonimizados). Quando nenhuma necessidade passa de 60% do tema, ele leva a etiqueta "várias necessidades": é um
fato para a equipe olhar, não um alarme (com relatos curtos, duas frases que só dividem "social" também caem juntas).
Grupo pouco coeso vira "relatos variados", no fim da lista.

Violência fica de fora (tem fluxo próprio; relato de violência não vira exemplo em painel de estatística).
Grupos com menos de 3 casos não aparecem. É uma pista para a equipe olhar, não uma classificação.
"""
import re
from collections import Counter
from datetime import timedelta
from typing import Dict, List, Sequence

import numpy as np

from app.models import Triagem, agora
from app.services.ml.text_rules import normalizar
from app.services.ml.train_evaluator import VIOLENCIA

MINIMO_CASOS = 12
MINIMO_POR_TEMA = 3
MAX_TEMAS = 12
PARCELA_DOMINANTE = 0.6
# Parecença média dos relatos com o centro do grupo (cosseno): abaixo disso o grupo é só sobra de relatos variados
COESAO_MINIMA = 0.35

# Palavras que não dizem o assunto (inclui o jeito de escrever no WhatsApp)
STOP_PT = set("""
a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro pras pros com sem sob sobre ate apos
e ou mas que se como quando onde porque pq por que ja nao sim mais menos muito muita muitos muitas pouco tambem tb
eu tu ele ela nos vos eles elas me te se lhe nos meu minha meus minhas teu tua seu sua seus suas dele dela deles delas
esse essa esses essas este esta estes estas isso isto aquele aquela aquilo ai ali aqui la ca
ser sou es e somos sao era eram foi foram ser sendo sido estar estou esta estamos estao estava estive esteve tava to ta tao
ter tenho tem temos tinha tive teve tido haver ha havia fazer faco faz fiz fez feito ir vou vai vamos ia fui
ola oi bom boa dia tarde noite obrigado obrigada por favor gostaria queria quero preciso precisa precisava ajuda ajudar
q vc vcs voce voces td tudo nada algum alguma alguem ninguem cada todo toda todos todas outro outra outros outras
mesmo mesma so apenas entao ainda agora hoje ontem amanha sempre nunca vez vezes coisa coisas
cpf nis telefone email nome endereco
consigo conseguir conseguindo consegui consegue saber sei sabe fiquei ficou fica acabou acho falar falou disse disseram
""".split())


def _texto(t: Triagem) -> str:
    bruto = t.relato_traducao or t.relato_anonimizado or ""
    return re.sub(r"\[[a-z_]+\]", " ", normalizar(bruto))  # tira marcas da anonimização ([cpf], [telefone])


def _formas_com_acento(casos: Sequence[Triagem]) -> Dict[str, str]:
    """Palavra sem acento → a forma mais usada nos relatos ('certidao' → 'certidão'), para mostrar na tela."""
    contagem: Dict[str, Counter] = {}
    for t in casos:
        for palavra in re.findall(r"[^\W\d_]{3,}", (t.relato_traducao or t.relato_anonimizado or "").lower()):
            contagem.setdefault(normalizar(palavra), Counter())[palavra] += 1
    return {k: c.most_common(1)[0][0] for k, c in contagem.items()}


def _vetorizar(textos: Sequence[str]):
    from sklearn.feature_extraction.text import TfidfVectorizer

    for min_df in (2, 1):
        try:
            vet = TfidfVectorizer(stop_words=list(STOP_PT), ngram_range=(1, 2), min_df=min_df, max_df=0.6,
                                  sublinear_tf=True, token_pattern=r"(?u)\b[a-z]{3,}\b")
            matriz = vet.fit_transform(textos)
            if matriz.shape[1] >= 5:
                return vet, matriz
        except ValueError:  # vocabulário vazio
            continue
    return None, None


def _melhor_k(matriz, n: int):
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    melhor = (None, -1.0, None)
    for k in range(2, min(MAX_TEMAS, n // MINIMO_POR_TEMA) + 1):
        modelo = KMeans(n_clusters=k, n_init=10, random_state=0).fit(matriz)
        if len(set(modelo.labels_)) < 2:
            continue
        nota = silhouette_score(matriz, modelo.labels_, metric="cosine")
        if nota > melhor[1]:
            melhor = (k, nota, modelo)
    return melhor


def agrupar(triagens: Sequence[Triagem], dias: int) -> Dict:
    casos = [t for t in triagens if t.categoria != VIOLENCIA and _texto(t).strip()]
    base = {"periodo_dias": dias, "casos_analisados": len(casos), "minimo": MINIMO_CASOS, "temas": []}
    if len(casos) < MINIMO_CASOS:
        return {**base, "suficiente": False}
    # Textos únicos: cada um lembra quais casos têm aquele texto
    por_texto: Dict[str, List[int]] = {}
    for i, t in enumerate(casos):
        por_texto.setdefault(_texto(t), []).append(i)
    textos = list(por_texto)
    if len(textos) < MINIMO_POR_TEMA * 2:
        return {**base, "suficiente": False}
    vet, matriz = _vetorizar(textos)
    if matriz is None:
        return {**base, "suficiente": False}
    k, nota, modelo = _melhor_k(matriz, len(textos))
    if modelo is None:
        return {**base, "suficiente": False}

    termos = np.array(vet.get_feature_names_out())
    formas = _formas_com_acento(casos)
    recente = agora() - timedelta(days=7)
    temas: List[dict] = []
    for g in range(k):
        unicos = [j for j, rot in enumerate(modelo.labels_) if rot == g]
        idx = [i for j in unicos for i in por_texto[textos[j]]]
        if len(idx) < MINIMO_POR_TEMA:
            continue
        centro = modelo.cluster_centers_[g]
        norma = float(np.linalg.norm(centro)) or 1.0
        parecencas = [float(matriz[j].toarray()[0] @ centro) / norma for j in unicos]
        coesao = float(np.mean(parecencas))
        principais = [termos[i] for i in centro.argsort()[::-1][:6] if centro[i] > 0]
        # Sem repetir palavra que já está num par ("cesta basica" e "cesta")
        palavras = []
        for termo in principais:
            if not any(termo in p or p in termo for p in palavras):
                palavras.append(termo)
        cats = Counter(casos[i].categoria for i in idx)
        dominante, qtd = cats.most_common(1)[0]
        # Exemplos: os relatos mais parecidos com o centro do grupo
        exemplos = []
        for j in [unicos[n] for n in np.argsort(parecencas)[::-1][:2]]:
            c = casos[por_texto[textos[j]][0]]
            texto = (c.relato_traducao or c.relato_anonimizado).strip()
            exemplos.append(texto[:160] + ("…" if len(texto) > 160 else ""))
        criados = [c.criado_em if c.criado_em.tzinfo else c.criado_em.replace(tzinfo=recente.tzinfo) for c in (casos[i] for i in idx)]
        temas.append({
            "palavras": [" ".join(formas.get(w, w) for w in termo.split()) for termo in palavras[:4]],
            "casos": len(idx),
            "ultimos_7_dias": sum(1 for c in criados if c >= recente),
            "necessidades": [{"categoria": c, "casos": n} for c, n in cats.most_common()],
            "necessidade_principal": dominante,
            "parcela_principal": round(qtd / len(idx), 2),
            "coesao": round(coesao, 2),
            "variado": coesao < COESAO_MINIMA,
            "relatos_diferentes": len(unicos),
            "varias_necessidades": qtd / len(idx) < PARCELA_DOMINANTE,
            "exemplos": exemplos,
        })
    temas.sort(key=lambda t: (t["variado"], -t["casos"]))
    return {**base, "suficiente": True, "silhueta": round(float(nota), 3), "temas": temas}
