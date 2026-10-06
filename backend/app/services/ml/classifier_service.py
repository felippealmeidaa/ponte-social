import os
import joblib
from typing import Dict, Any, List
from app.services.ml.text_rules import predict_heuristic
from app.services import catalogo
from app.services.llm import entendimento
from app.services.ml.train_evaluator import NAO_IDENTIFICADO, VIOLENCIA, decidir

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model_social_classifier.joblib")

METODOS = {
    "regra_violencia": "Regra de Segurança Prioritária (Violência/Proteção)",
    "modelo_violencia": "Modelo de Machine Learning (sinal de violência)",
    "modelo": "Modelo de Machine Learning",
    "palavras_chave": "Palavras-chave (modelo com baixa confiança)",
    "nao_identificado": "Nenhuma necessidade identificada com segurança",
    "ia": "IA generativa (Gemini), que leu a mensagem e escolheu entre as categorias do catálogo",
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

        return cls.montar(categoria, metodo, confianca, secundarias)

    @staticmethod
    def montar(categoria: str, metodo: str, confianca: float = 0.0, secundarias: List[str] = ()) -> Dict[str, Any]:
        """Resultado da classificação com o caminho do catálogo (usado pelo modelo local e pela IA)."""
        info_servico = catalogo.servico(categoria)
        return {
            "categoria": categoria,
            "titulo_encaminhamento": info_servico["titulo"],
            "confianca": round(confianca, 4),
            "metodo_decisao": METODOS[metodo],
            "prioridade": PRIORIDADE_POR_CATEGORIA.get(categoria, "BAIXA"),
            "is_urgente": info_servico["urgencia"],
            "necessidades_secundarias": list(secundarias),
            "servicos_recomendados": info_servico["servicos"],
            "documentos_necessarios": info_servico["documentos"],
            "local_atendimento": info_servico["local_atendimento"],
            "contato_util": info_servico["contato_util"],
        }

    @classmethod
    async def classificar(cls, texto: str) -> Dict[str, Any]:
        """Usada no WhatsApp: a IA lê a mensagem; sem IA (sem chave ou fora do ar), vale o modelo local.
        Segurança primeiro: se a regra ou o modelo local virem violência, o caso é tratado como violência
        mesmo que a IA discorde. "tipo_mensagem" diz se é pedido, cumprimento ou outro (None sem IA)."""
        local = cls.classify_relato(texto)
        ia = await entendimento.entender(texto)
        if ia is None:
            return {**local, "tipo_mensagem": None, "resumo_ia": ""}
        if local["categoria"] == VIOLENCIA and ia["categoria"] != VIOLENCIA:
            return {**local, "tipo_mensagem": "pedido", "resumo_ia": ""}
        return {**cls.montar(ia["categoria"], "ia" if ia["categoria"] != NAO_IDENTIFICADO else "nao_identificado",
                             secundarias=ia["secundarias"]),
                "tipo_mensagem": ia["tipo"], "resumo_ia": ia["resumo"], "idioma": ia.get("idioma", "pt")}
