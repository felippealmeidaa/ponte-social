import os
import joblib
from typing import Dict, Any, Optional
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES, KEYWORDS_HEURISTIC, predict_heuristic

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_social_classifier.joblib")

class SocialClassifierService:
    _model = None

    @classmethod
    def get_model(cls):
        if cls._model is None:
            if os.path.exists(MODEL_PATH):
                try:
                    cls._model = joblib.load(MODEL_PATH)
                except Exception as e:
                    print(f"Erro ao carregar modelo joblib: {e}")
                    cls._model = None
        return cls._model

    @classmethod
    def classify_relato(cls, texto: str) -> Dict[str, Any]:
        texto_clean = texto.strip()
        texto_lower = texto_clean.lower()
        
        # 1. Regra de Segurança Máxima: Detecção Imediata de Violência/Ameaça
        palavras_violencia = KEYWORDS_HEURISTIC["violencia_protecao"]
        if any(w in texto_lower for w in palavras_violencia):
            categoria = "violencia_protecao"
            confianca = 0.99
            metodo = "Regra de Segurança Prioritária (Violência/Proteção)"
            prioridade = "URGENTE_VIOLENCIA"
        else:
            # 2. Inferência pelo Modelo de Machine Learning (Linear SVM / LogReg)
            model = cls.get_model()
            if model is not None:
                try:
                    categoria = model.predict([texto_clean])[0]
                    # Score de decisão ou probabilidade
                    if hasattr(model, "predict_proba"):
                        probs = model.predict_proba([texto_clean])[0]
                        confianca = float(max(probs))
                    else:
                        confianca = 0.95
                    metodo = "Modelo de Machine Learning (Linear SVM / NLP)"
                except Exception:
                    categoria = predict_heuristic(texto_clean)
                    confianca = 0.70
                    metodo = "Linha de Base Heurística (Fallback)"
            else:
                categoria = predict_heuristic(texto_clean)
                confianca = 0.70
                metodo = "Linha de Base Heurística"
            
            # Prioridade padrão por categoria
            if categoria in ["moradia", "alimentacao", "renda_beneficio"]:
                prioridade = "ALTA"
            elif categoria in ["pessoa_idosa_pcd", "cadastro_atualizacao", "documentacao"]:
                prioridade = "MEDIA"
            else:
                prioridade = "BAIXA"

        info_servico = KNOWLEDGE_SERVICES.get(categoria, KNOWLEDGE_SERVICES["renda_beneficio"])

        return {
            "categoria": categoria,
            "titulo_encaminhamento": info_servico["titulo"],
            "confianca": confianca,
            "metodo_decisao": metodo,
            "prioridade": prioridade,
            "is_urgente": info_servico["urgencia"],
            "servicos_recomendados": info_servico["servicos"],
            "documentos_necessarios": info_servico["documentos"],
            "local_atendimento": info_servico["local_atendimento"],
            "contato_util": info_servico["contato_util"]
        }
