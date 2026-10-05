import os
import joblib
from typing import Dict, Any, List
from app.services.ml.text_rules import predict_heuristic
from app.services.ml.train_evaluator import KNOWLEDGE_SERVICES, NAO_IDENTIFICADO, VIOLENCIA, decidir

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_social_classifier.joblib")

METODOS = {
    "regra_violencia": "Regra de Segurança Prioritária (Violência/Proteção)",
    "modelo_violencia": "Modelo de Machine Learning (sinal de violência)",
    "modelo": "Modelo de Machine Learning",
    "palavras_chave": "Palavras-chave (modelo com baixa confiança)",
    "nao_identificado": "Nenhuma necessidade identificada com segurança",
}

PRIORIDADE_POR_CATEGORIA = {
    VIOLENCIA: "URGENTE_VIOLENCIA",
    "moradia": "ALTA",
    "alimentacao": "ALTA",
    "renda_beneficio": "ALTA",
    "pessoa_idosa_pcd": "MEDIA",
    "cadastro_atualizacao": "MEDIA",
    "documentacao": "MEDIA",
}

# Uma segunda necessidade só é mostrada se o modelo der pelo menos essa probabilidade a ela.
LIMIAR_SECUNDARIA = 0.25


class SocialClassifierService:
    _artefato = None

    @classmethod
    def get_artefato(cls):
        """Carrega o modelo uma única vez. Formato: dict com pipeline e limiares (ver train_evaluator)."""
        if cls._artefato is None and os.path.exists(MODEL_PATH):
            try:
                artefato = joblib.load(MODEL_PATH)
                if isinstance(artefato, dict) and "pipeline" in artefato:
                    cls._artefato = artefato
                else:
                    print("Modelo em formato antigo; rode train_evaluator.py para regerar.")
            except Exception as e:
                print(f"Erro ao carregar modelo joblib: {e}")
        return cls._artefato

    @classmethod
    def classify_relato(cls, texto: str) -> Dict[str, Any]:
        texto_clean = texto.strip()
        artefato = cls.get_artefato()
        secundarias: List[str] = []

        if artefato is not None:
            pipeline = artefato["pipeline"]
            classes = list(pipeline.classes_)
            probs = pipeline.predict_proba([texto_clean])[0]
            categoria, metodo = decidir(texto_clean, probs, classes, artefato["limiar_confianca"], artefato["limiar_violencia"])
            confianca = float(probs[classes.index(categoria)]) if categoria in classes else float(max(probs))
            secundarias = [
                c for c, p in sorted(zip(classes, probs), key=lambda x: -x[1])
                if c != categoria and p >= LIMIAR_SECUNDARIA
            ]
        else:
            # Sem modelo treinado: só as regras (linha de base)
            categoria = predict_heuristic(texto_clean) or NAO_IDENTIFICADO
            metodo = "regra_violencia" if categoria == VIOLENCIA else ("palavras_chave" if categoria != NAO_IDENTIFICADO else "nao_identificado")
            confianca = 0.0

        info_servico = KNOWLEDGE_SERVICES[categoria]
        return {
            "categoria": categoria,
            "titulo_encaminhamento": info_servico["titulo"],
            "confianca": round(confianca, 4),
            "metodo_decisao": METODOS[metodo],
            "prioridade": PRIORIDADE_POR_CATEGORIA.get(categoria, "BAIXA"),
            "is_urgente": info_servico["urgencia"],
            "necessidades_secundarias": secundarias,
            "servicos_recomendados": info_servico["servicos"],
            "documentos_necessarios": info_servico["documentos"],
            "local_atendimento": info_servico["local_atendimento"],
            "contato_util": info_servico["contato_util"],
        }
