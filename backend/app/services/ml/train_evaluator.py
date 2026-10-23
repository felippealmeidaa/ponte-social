"""
Treino e avaliação do classificador de necessidades sociais.

Metodologia (pensada para não inflar métricas):
1. As frases de treino vêm de frases-modelo; variações da mesma frase (só muda um número)
   formam um GRUPO. Duplicatas exatas são removidas.
2. Validação cruzada StratifiedGroupKFold (k=5): um grupo nunca aparece no treino e na
   validação ao mesmo tempo. É nela que os hiperparâmetros são ajustados e o modelo é escolhido.
3. O número que vale para a banca é o do CONJUNTO DE TESTE separado
   (data/relatos_teste_informais.json), escrito à parte, com linguagem de WhatsApp.
   Ele nunca é usado para treinar nem para escolher modelo.
4. No teste: F1 macro com intervalo de confiança por bootstrap, revocação da classe
   violência (modelo sozinho e sistema completo = regra de segurança + modelo),
   matriz de confusão e teste de McNemar entre os dois melhores modelos.
"""
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import joblib
import numpy as np
import pandas as pd
from scipy.stats import binomtest
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score, recall_score, accuracy_score
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold, cross_val_predict
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from app.services.ml.text_rules import KEYWORDS_HEURISTIC, detectar_violencia, normalizar, predict_heuristic  # noqa: F401 (reexport)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "..", "data"))
DATASET_PATH = os.path.join(DATA_DIR, "relatos_treino_social.json")
TEST_PATH = os.path.join(DATA_DIR, "relatos_teste_informais.json")
MODEL_OUTPUT = os.path.join(BASE_DIR, "model_social_classifier.joblib")
REPORT_OUTPUT = os.path.join(BASE_DIR, "mlops_evaluation_report.json")

VIOLENCIA = "violencia_protecao"
NAO_IDENTIFICADO = "nao_identificado"
# Os limiares de decisão (confiança mínima e probabilidade de violência que já dispara urgência)
# são escolhidos na validação cruzada em escolher_limiares() e salvos junto com o modelo.
SEED = 42

# Dicionário de serviços e orientações por categoria
KNOWLEDGE_SERVICES = {
    "renda_beneficio": {
        "titulo": "Programas de Transferência de Renda (Bolsa Família / BPC)",
        "servicos": ["Inscrição no Cadastro Único", "Encaminhamento para Bolsa Família", "Agendamento de BPC / LOAS"],
        "documentos": ["Documento com foto (RG ou CNH)", "CPF de todos os membros da família", "Comprovante de residência", "Carteira de trabalho (mesmo sem registro)", "Comprovante de matrícula escolar das crianças"],
        "local_atendimento": "CRAS de referência do seu bairro ou Secretaria de Desenvolvimento Social",
        "contato_util": "Disque Social 121 / CRAS Central",
        "urgencia": False
    },
    "cadastro_atualizacao": {
        "titulo": "Cadastro Único para Programas Sociais (CadÚnico)",
        "servicos": ["Atualização cadastral bienal", "Inclusão de novos membros familiares", "Emissão de Folha Resumo / NIS"],
        "documentos": ["RG e CPF do Responsável Familiar", "Certidão de nascimento dos menores", "Comprovante de endereço recente (conta de luz)", "Declaração escolar"],
        "local_atendimento": "Posto do Cadastro Único ou CRAS mais próximo",
        "contato_util": "Disque Social 121 / Aplicativo Cadastro Único",
        "urgencia": False
    },
    "moradia": {
        "titulo": "Habitação de Interesse Social e Aluguel Social",
        "servicos": ["Inscrição em programas habitacionais municipais", "Solicitação de Aluguel Social emergencial", "Vistoria da Defesa Civil"],
        "documentos": ["Documentos pessoais de todos os moradores", "Laudo da Defesa Civil (se área de risco)", "Comprovante de renda ou declaração de vulnerabilidade"],
        "local_atendimento": "Secretaria Municipal de Habitação / CRAS",
        "contato_util": "Defesa Civil 199 (em caso de desabamento/chuvas)",
        "urgencia": False
    },
    "documentacao": {
        "titulo": "Acesso à Documentação Básica Gratuita",
        "servicos": ["Emissão de declaração de hipossuficiência para 2ª via gratuita de certidões", "Agendamento para Carteira de Identidade (RG/CIN)", "Regularização de CPF"],
        "documentos": ["Boletim de Ocorrência (em caso de perda/roubo)", "Qualquer comprovante ou certidão antiga disponível"],
        "local_atendimento": "CRAS ou Vapt Vupt / Poupatempo municipal",
        "contato_util": "Cartório de Registro Civil / CRAS",
        "urgencia": False
    },
    "alimentacao": {
        "titulo": "Segurança Alimentar e Nutricional",
        "servicos": ["Concessão de cesta básica emergencial", "Acesso ao Restaurante Popular Comunitário", "Auxílio Alimentação Municipal"],
        "documentos": ["Documento com foto", "Comprovante de residência", "Número do NIS (se tiver)"],
        "local_atendimento": "CRAS do seu território ou Banco de Alimentos",
        "contato_util": "CRAS de referência",
        "urgencia": False
    },
    "pessoa_idosa_pcd": {
        "titulo": "Atenção Integral a Idosos e Pessoas com Deficiência",
        "servicos": ["Centro de Convivência de Idosos (CCI)", "Passe Livre municipal e interestadual", "BPC para Idoso e PCD", "Insumos (fraldas/cadeira de rodas)"],
        "documentos": ["Laudo médico com CID (para PCD)", "RG, CPF e comprovante de renda de todos os moradores", "CadÚnico atualizado"],
        "local_atendimento": "CRAS, CREAS ou Conselho Municipal do Idoso/PCD",
        "contato_util": "Disque Direitos Humanos 100",
        "urgencia": False
    },
    "trabalho_renda": {
        "titulo": "Qualificação Profissional e Intermediação de Mão de Obra",
        "servicos": ["Encaminhamento para vagas de emprego (SINE)", "Cursos gratuitos de capacitação profissional", "Apoio ao Microempreendedor Individual (Sala do Empreendedor)"],
        "documentos": ["Carteira de Trabalho (física ou digital)", "Currículo", "Comprovante de escolaridade e endereço"],
        "local_atendimento": "Posto do SINE Municipal ou Centro de Qualificação",
        "contato_util": "SINE Municipal",
        "urgencia": False
    },
    "violencia_protecao": {
        "titulo": "PROTEÇÃO IMEDIATA E ATENDIMENTO ESPECIALIZADO",
        "servicos": ["Atendimento emergencial CREAS", "Acolhimento institucional / Casa Abrigo", "Encaminhamento para Delegacia Especializada (DEAM / DPCA)", "Solicitação de Medida Protetiva"],
        "documentos": ["Não é obrigatório apresentar documentos para o primeiro acolhimento de emergência"],
        "local_atendimento": "CREAS (Centro de Referência Especializado de Assistência Social) ou Delegacia",
        "contato_util": "EMERGÊNCIA: Polícia Militar 190 | Mulher: Ligue 180 | Crianças/Idosos: Disque 100",
        "urgencia": True
    },
    NAO_IDENTIFICADO: {
        "titulo": "Orientação geral da Assistência Social",
        "servicos": ["Atendimento de acolhida no CRAS", "Orientação telefônica pelo Disque Social 121"],
        "documentos": ["Documento com foto (RG ou CNH)", "CPF", "Comprovante de residência"],
        "local_atendimento": "CRAS de referência do seu bairro",
        "contato_util": "Disque Social 121 (gratuito)",
        "urgencia": False
    }
}

CATEGORIAS = [c for c in KNOWLEDGE_SERVICES if c != NAO_IDENTIFICADO]


def carregar_treino(path: str = DATASET_PATH) -> pd.DataFrame:
    with open(path, "r", encoding="utf-8") as f:
        df = pd.DataFrame(json.load(f))
    df = df.drop_duplicates(subset="texto").reset_index(drop=True)
    # Variações da mesma frase-modelo diferem só nos números: tirando os dígitos, sobra a frase-modelo.
    df["grupo"] = df["texto"].map(lambda t: re.sub(r"\d+", "#", t)).factorize()[0]
    return df


def carregar_teste(path: str = TEST_PATH) -> pd.DataFrame:
    with open(path, "r", encoding="utf-8") as f:
        return pd.DataFrame(json.load(f)["relatos"])


def _tfidf() -> TfidfVectorizer:
    return TfidfVectorizer(strip_accents="unicode", lowercase=True, sublinear_tf=True)


def modelos_candidatos():
    """Pipelines e grades de hiperparâmetros. A grade inclui n-gramas de caracteres, que
    toleram erros de digitação ("cad unico", "cadunico") melhor que palavras inteiras."""
    grade_texto = [
        {"tfidf__analyzer": ["word"], "tfidf__ngram_range": [(1, 1), (1, 2)]},
        {"tfidf__analyzer": ["char_wb"], "tfidf__ngram_range": [(2, 4), (3, 5)]},
    ]
    def com(grade_clf):
        return [{**g, **grade_clf} for g in grade_texto]

    return {
        "Regressão Logística": (
            Pipeline([("tfidf", _tfidf()), ("clf", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED))]),
            com({"clf__C": [1.0, 5.0, 20.0]}),
        ),
        "Multinomial Naive Bayes": (
            Pipeline([("tfidf", _tfidf()), ("clf", MultinomialNB())]),
            com({"clf__alpha": [0.1, 0.5, 1.0]}),
        ),
        "Linear SVM": (
            Pipeline([("tfidf", _tfidf()), ("clf", LinearSVC(class_weight="balanced", random_state=SEED))]),
            com({"clf__C": [0.1, 1.0, 10.0]}),
        ),
    }


def bootstrap_f1(y_true, y_pred, n: int = 2000, seed: int = SEED):
    rng = np.random.default_rng(seed)
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    amostras = []
    for _ in range(n):
        idx = rng.integers(0, len(y_true), len(y_true))
        amostras.append(f1_score(y_true[idx], y_pred[idx], average="macro", labels=CATEGORIAS, zero_division=0))
    return float(np.percentile(amostras, 2.5)), float(np.percentile(amostras, 97.5))


def mcnemar(y_true, pred_a, pred_b):
    """McNemar exato: só os casos em que um modelo acerta e o outro erra importam."""
    y_true, pred_a, pred_b = map(np.asarray, (y_true, pred_a, pred_b))
    a_certo_b_errado = int(np.sum((pred_a == y_true) & (pred_b != y_true)))
    a_errado_b_certo = int(np.sum((pred_a != y_true) & (pred_b == y_true)))
    discordantes = a_certo_b_errado + a_errado_b_certo
    p = 1.0 if discordantes == 0 else float(binomtest(a_certo_b_errado, discordantes, 0.5).pvalue)
    return {"a_certo_b_errado": a_certo_b_errado, "a_errado_b_certo": a_errado_b_certo, "p_valor": p}


def recall_violencia(y_true, y_pred) -> float:
    return float(recall_score(np.asarray(y_true) == VIOLENCIA, np.asarray(y_pred) == VIOLENCIA, zero_division=0))


def metricas(y_true, y_pred) -> dict:
    return {
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", labels=CATEGORIAS, zero_division=0)),
        "acuracia": float(accuracy_score(y_true, y_pred)),
        "recall_violencia": recall_violencia(y_true, y_pred),
    }


def decidir(texto: str, probs, classes, limiar_confianca: float, limiar_violencia: float):
    """Decisão usada em produção e na avaliação. Devolve (categoria, método).
    Ordem: regra de violência → modelo (se confiante) → palavras-chave → não identificado."""
    i_viol = classes.index(VIOLENCIA)
    topo = classes[int(np.argmax(probs))]
    if detectar_violencia(texto):
        return VIOLENCIA, "regra_violencia"
    if topo == VIOLENCIA or probs[i_viol] >= limiar_violencia:
        return VIOLENCIA, "modelo_violencia"
    if max(probs) >= limiar_confianca:
        return topo, "modelo"
    heuristica = predict_heuristic(texto)
    if heuristica:
        return heuristica, "palavras_chave"
    return NAO_IDENTIFICADO, "nao_identificado"


def predizer_sistema(probs_por_texto, textos, classes, limiar_confianca: float, limiar_violencia: float):
    return [decidir(t, p, classes, limiar_confianca, limiar_violencia)[0] for t, p in zip(textos, probs_por_texto)]


def escolher_limiares(probs_oof, X, y, classes):
    """Escolhe os limiares na validação cruzada (probabilidades fora da dobra), nunca no teste.
    Critério: respeitar a revocação de violência máxima alcançável e, entre as opções, maior F1 macro."""
    opcoes = []
    for lc in [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50]:
        for lv in [0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.70]:
            pred = predizer_sistema(probs_oof, X, classes, lc, lv)
            opcoes.append((recall_violencia(y, pred), metricas(y, pred)["f1_macro"], lv, lc))
    melhor_recall = max(o[0] for o in opcoes)
    _, _, lv, lc = max(o for o in opcoes if o[0] == melhor_recall)
    return lc, lv


def train_and_evaluate(dataset_path: str = DATASET_PATH, output_model_path: str = MODEL_OUTPUT,
                       report_output_path: str = REPORT_OUTPUT, test_path: str = TEST_PATH,
                       exemplos_reais: Optional[list] = None, n_jobs: int = -1):
    """exemplos_reais: [{"texto", "categoria"}] de casos confirmados pela pessoa ou corrigidos pela equipe.
    Entram só no treino (nunca no teste, que fica fixo para a comparação ser justa)."""
    print("=" * 70)
    print("TREINO E AVALIAÇÃO DO CLASSIFICADOR DE NECESSIDADES SOCIAIS")
    print("=" * 70)

    df = carregar_treino(dataset_path)
    teste = carregar_teste(test_path)
    df["origem"] = "simulado"
    n_reais = 0
    if exemplos_reais:
        textos_teste = {t.strip().lower() for t in teste["texto"]}
        reais = pd.DataFrame([e for e in exemplos_reais if e["categoria"] in CATEGORIAS
                              and e["texto"].strip().lower() not in textos_teste])  # nada do teste entra no treino
        if len(reais):
            reais = reais.drop_duplicates(subset="texto")
            reais = reais[~reais["texto"].isin(df["texto"])]
            reais["grupo"] = range(int(df["grupo"].max()) + 1, int(df["grupo"].max()) + 1 + len(reais))
            reais["origem"] = "real"
            n_reais = len(reais)
            df = pd.concat([df, reais[["texto", "categoria", "grupo", "origem"]]], ignore_index=True)
    X, y, grupos = df["texto"].to_list(), df["categoria"].to_list(), df["grupo"].to_list()
    X_teste, y_teste = teste["texto"].to_list(), teste["categoria"].to_list()
    print(f"Treino: {len(df)} relatos únicos em {df['grupo'].nunique()} frases-modelo | Teste: {len(teste)} relatos informais")

    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)

    # Linhas de base
    classe_majoritaria = pd.Series(y).value_counts().index[0]
    baselines = {}
    for nome, prever, descricao in [
        ("classe_majoritaria", lambda textos: [classe_majoritaria] * len(textos), f"Responde sempre '{classe_majoritaria}'"),
        ("regras_palavras_chave", lambda textos: [predict_heuristic(t) or NAO_IDENTIFICADO for t in textos],
         "Palavras e radicais por categoria (text_rules.py), violência primeiro"),
    ]:
        baselines[nome] = {
            "descricao": descricao,
            "validacao_cruzada": metricas(y, prever(X)),
            "teste_informal": metricas(y_teste, prever(X_teste)),
        }
        # Compatibilidade com o formato antigo do relatório
        baselines[nome]["f1_macro"] = baselines[nome]["teste_informal"]["f1_macro"]
        baselines[nome]["recall_violencia"] = baselines[nome]["teste_informal"]["recall_violencia"]

    # Modelos: ajuste de hiperparâmetros com CV agrupada, depois avaliação no teste
    resultados, ajustados, preds_teste = {}, {}, {}
    for nome, (pipeline, grade) in modelos_candidatos().items():
        busca = GridSearchCV(pipeline, grade, scoring="f1_macro", cv=cv, n_jobs=n_jobs)
        busca.fit(X, y, groups=grupos)
        i = busca.best_index_
        oof = cross_val_predict(busca.best_estimator_, X, y, groups=grupos, cv=cv)
        pred = busca.best_estimator_.predict(X_teste)
        ajustados[nome], preds_teste[nome] = busca.best_estimator_, pred
        teste_m = metricas(y_teste, pred)
        teste_m["f1_macro_ic95"] = bootstrap_f1(y_teste, pred)
        resultados[nome] = {
            "melhores_hiperparametros": {k: (list(v) if isinstance(v, tuple) else v) for k, v in busca.best_params_.items()},
            "f1_macro_mean": float(busca.cv_results_["mean_test_score"][i]),
            "f1_macro_std": float(busca.cv_results_["std_test_score"][i]),
            "accuracy_mean": float(accuracy_score(y, oof)),
            "recall_violencia_cv": recall_violencia(y, oof),
            "teste_informal": teste_m,
        }
        print(f"{nome:26s} CV F1={resultados[nome]['f1_macro_mean']:.3f}±{resultados[nome]['f1_macro_std']:.3f} | "
              f"teste F1={teste_m['f1_macro']:.3f} IC95={teste_m['f1_macro_ic95'][0]:.3f}-{teste_m['f1_macro_ic95'][1]:.3f} "
              f"recall_viol={teste_m['recall_violencia']:.2f}")

    # Escolha pelo CV (nunca pelo teste). Empate técnico (< 0,01) favorece a Regressão Logística, que é explicável.
    ordem = sorted(resultados, key=lambda n: resultados[n]["f1_macro_mean"], reverse=True)
    melhor = ordem[0]
    if melhor != "Regressão Logística" and resultados[melhor]["f1_macro_mean"] - resultados["Regressão Logística"]["f1_macro_mean"] < 0.01:
        melhor = "Regressão Logística"
    segundo = next(n for n in ordem if n != melhor)

    final = ajustados[melhor]
    if not hasattr(final, "predict_proba"):
        # O SVM não dá probabilidade; calibramos para poder usar limiar de confiança e confirmação por botões.
        final = CalibratedClassifierCV(clone(final), method="sigmoid", cv=3)
    probs_oof = cross_val_predict(clone(final), X, y, groups=grupos, cv=cv, method="predict_proba")
    final.fit(X, y)
    classes = list(final.classes_)
    limiar_confianca, limiar_violencia = escolher_limiares(probs_oof, X, y, classes)
    print(f"Limiares escolhidos na validação cruzada: confiança={limiar_confianca} violência={limiar_violencia}")

    pred_modelo = final.predict(X_teste)
    pred_sistema = predizer_sistema(final.predict_proba(X_teste), X_teste, classes, limiar_confianca, limiar_violencia)
    classes_cm = CATEGORIAS + [NAO_IDENTIFICADO]
    erros = [
        {"texto": t, "esperado": e, "previsto": p}
        for t, e, p in zip(X_teste, y_teste, pred_sistema) if e != p
    ]

    joblib.dump({
        "pipeline": final,
        "nome": melhor,
        "limiar_confianca": limiar_confianca,
        "limiar_violencia": limiar_violencia,
        "treinado_em": datetime.now(timezone.utc).isoformat(),
    }, output_model_path)

    sistema_m = metricas(y_teste, pred_sistema)
    sistema_m["f1_macro_ic95"] = bootstrap_f1(y_teste, pred_sistema)
    sistema_m["taxa_nao_identificado"] = float(np.mean(np.asarray(pred_sistema) == NAO_IDENTIFICADO))
    sistema_m["metodos"] = pd.Series([decidir(t, p, classes, limiar_confianca, limiar_violencia)[1] for t, p in zip(X_teste, final.predict_proba(X_teste))]).value_counts().to_dict()

    relatorio = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metodologia": {
            "treino": f"{len(df)} relatos únicos ({df['grupo'].nunique()} frases-modelo) após remover duplicatas"
                      + (f", dos quais {n_reais} reais (confirmados pela pessoa ou corrigidos pela equipe)" if n_reais else ""),
            "validacao": "StratifiedGroupKFold k=5 agrupando variações da mesma frase-modelo; GridSearchCV para hiperparâmetros",
            "teste": f"{len(teste)} relatos informais simulados, escritos à parte e nunca usados no treino nem na escolha do modelo",
            "escolha_do_modelo": "maior F1 macro na validação cruzada; empate (<0,01) favorece Regressão Logística",
            "limiares": "escolhidos com probabilidades fora da dobra: primeiro a maior revocação de violência, depois o maior F1 macro",
            "decisao": "regra de violência → modelo (se confiante) → palavras-chave → não identificado (Disque Social 121)",
            "limitacao": "treino e teste ainda são simulados; os números precisam ser refeitos com relatos reais do CRAS",
        },
        "dataset_size": len(df),
        "exemplos_reais": n_reais,
        "test_size": len(teste),
        "classes": CATEGORIAS,
        "baselines": baselines,
        "modelos_avaliados_cv5": resultados,
        "comparacao_mcnemar": {"modelo_a": melhor, "modelo_b": segundo, **mcnemar(y_teste, preds_teste[melhor], preds_teste[segundo])},
        "modelo_final": {
            "nome": melhor,
            "limiar_confianca": limiar_confianca,
            "limiar_violencia": limiar_violencia,
            "teste_modelo_sozinho": metricas(y_teste, pred_modelo),
            "teste_sistema_completo": sistema_m,
            # Campos do formato antigo, agora medidos no TESTE (antes eram no próprio treino)
            "f1_macro": sistema_m["f1_macro"],
            "recall_violencia": sistema_m["recall_violencia"],
            "classification_report": classification_report(y_teste, pred_sistema, labels=classes_cm, output_dict=True, zero_division=0),
            "confusion_matrix_labels": classes_cm,
            "confusion_matrix": confusion_matrix(y_teste, pred_sistema, labels=classes_cm).tolist(),
            "erros_no_teste": erros,
        },
    }
    with open(report_output_path, "w", encoding="utf-8") as f:
        json.dump(relatorio, f, indent=2, ensure_ascii=False)

    print("-" * 70)
    print(f"Modelo escolhido: {melhor} (McNemar vs {segundo}: p={relatorio['comparacao_mcnemar']['p_valor']:.3f})")
    print(f"Sistema completo no teste: F1={sistema_m['f1_macro']:.3f} IC95={sistema_m['f1_macro_ic95'][0]:.3f}-{sistema_m['f1_macro_ic95'][1]:.3f} "
          f"| recall violência={sistema_m['recall_violencia']:.2f} | não identificado={sistema_m['taxa_nao_identificado']:.0%}")
    print(f"Erros no teste: {len(erros)} de {len(teste)}")
    return relatorio


if __name__ == "__main__":
    train_and_evaluate()
