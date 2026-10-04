import json
import os
import numpy as np
import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import classification_report, confusion_matrix, f1_score, recall_score, precision_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "..", "data"))
DATASET_PATH = os.path.join(DATA_DIR, "relatos_treino_social.json")
MODEL_OUTPUT = os.path.join(BASE_DIR, "model_social_classifier.joblib")
REPORT_OUTPUT = os.path.join(BASE_DIR, "mlops_evaluation_report.json")

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
    }
}

# Palavras-chave para a Linha de Base Heurística
KEYWORDS_HEURISTIC = {
    "violencia_protecao": ["violência", "agrediu", "agressao", "bateu", "ameaca", "morte", "medida protetiva", "abuso", "espancou", "maltrato", "socorro", "apanhando"],
    "renda_beneficio": ["bolsa familia", "bpc", "auxilio", "beneficio", "dinheiro", "renda", "sustentar", "financeira", "loas", "passando necessidade"],
    "cadastro_atualizacao": ["cadunico", "cadastro unico", "nis", "recadastramento", "atualizar", "atualizacao", "folha resumo"],
    "moradia": ["morar", "aluguel", "despejado", "desabamento", "desabrigado", "rua", "barraco", "casa", "defesa civil"],
    "documentacao": ["rg", "identidade", "certidao", "nascimento", "cpf", "segunda via", "cartorio", "documentos"],
    "alimentacao": ["comida", "fome", "cesta basica", "leite", "arroz", "feijao", "restaurante popular", "alimentacao", "despensa"],
    "pessoa_idosa_pcd": ["idoso", "idosa", "deficiencia", "pcd", "cadeira de rodas", "fraldas", "autista", "65 anos", "passe livre"],
    "trabalho_renda": ["emprego", "trabalho", "vagas", "curriculo", "curso", "capacitacao", "sine", "microempreendedor"]
}

def predict_heuristic(text: str) -> str:
    text_lower = text.lower()
    for cat, words in KEYWORDS_HEURISTIC.items():
        if any(w in text_lower for w in words):
            return cat
    return "renda_beneficio"  # fallback majoritário

def train_and_evaluate(dataset_path: str = DATASET_PATH, output_model_path: str = MODEL_OUTPUT, report_output_path: str = REPORT_OUTPUT):
    print("=" * 70)
    print("INICIANDO TREINAMENTO E AVALIAÇÃO CIENTÍFICA DO MODELO SOCIAL")
    print("=" * 70)
    
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    df = pd.DataFrame(data)
    X = df["texto"].values
    y = df["categoria"].values
    
    # 1. Linha de Base 1: Classe Majoritária
    majority_class = df["categoria"].value_counts().index[0]
    y_pred_majority = [majority_class] * len(y)
    f1_maj = f1_score(y, y_pred_majority, average="macro", zero_division=0)
    rec_maj_violencia = recall_score(y == "violencia_protecao", np.array(y_pred_majority) == "violencia_protecao", zero_division=0)
    
    # 2. Linha de Base 2: Heurística por Palavras-Chave
    y_pred_heur = [predict_heuristic(t) for t in X]
    f1_heur = f1_score(y, y_pred_heur, average="macro", zero_division=0)
    rec_heur_violencia = recall_score(y == "violencia_protecao", np.array(y_pred_heur) == "violencia_protecao", zero_division=0)
    
    # Modelos Candidatos
    models = {
        "Multinomial Naive Bayes": Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", MultinomialNB(alpha=0.5))
        ]),
        "Linear SVM": Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LinearSVC(C=1.0, random_state=42))
        ]),
        "Regressão Logística": Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LogisticRegression(C=2.0, max_iter=1000, random_state=42, class_weight="balanced"))
        ])
    }
    
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    results = {}
    
    for name, pipeline in models.items():
        scoring = ["f1_macro", "accuracy", "precision_macro", "recall_macro"]
        scores = cross_validate(pipeline, X, y, cv=cv, scoring=scoring)
        
        results[name] = {
            "f1_macro_mean": float(np.mean(scores["test_f1_macro"])),
            "f1_macro_std": float(np.std(scores["test_f1_macro"])),
            "accuracy_mean": float(np.mean(scores["test_accuracy"])),
            "precision_mean": float(np.mean(scores["test_precision_macro"])),
            "recall_mean": float(np.mean(scores["test_recall_macro"]))
        }
    
    best_model_name = max(results, key=lambda k: results[k]["f1_macro_mean"])
    best_pipeline = models[best_model_name]
    best_pipeline.fit(X, y)
    y_pred_final = best_pipeline.predict(X)
    
    report = classification_report(y, y_pred_final, output_dict=True, zero_division=0)
    cm = confusion_matrix(y, y_pred_final, labels=sorted(list(set(y))))
    classes_sorted = sorted(list(set(y)))
    
    os.makedirs(os.path.dirname(output_model_path), exist_ok=True)
    joblib.dump(best_pipeline, output_model_path)
    
    mlops_report = {
        "timestamp": "2026-10-04T02:00:00Z",
        "dataset_size": len(df),
        "classes": classes_sorted,
        "baselines": {
            "classe_majoritaria": {
                "f1_macro": float(f1_maj),
                "recall_violencia": float(rec_maj_violencia),
                "descricao": f"Responde sempre '{majority_class}'"
            },
            "regras_palavras_chave": {
                "f1_macro": float(f1_heur),
                "recall_violencia": float(rec_heur_violencia),
                "descricao": "Dicionário de termos estáticos"
            }
        },
        "modelos_avaliados_cv5": results,
        "modelo_final": {
            "nome": best_model_name,
            "f1_macro": float(f1_score(y, y_pred_final, average="macro")),
            "recall_violencia": float(report.get("violencia_protecao", {}).get("recall", 1.0)),
            "precision_macro": float(precision_score(y, y_pred_final, average="macro")),
            "classification_report": report,
            "confusion_matrix": cm.tolist()
        }
    }
    
    with open(report_output_path, "w", encoding="utf-8") as f:
        json.dump(mlops_report, f, indent=2, ensure_ascii=False)
    print("Modelo e relatório MLOps atualizados com sucesso!")

if __name__ == "__main__":
    train_and_evaluate()
