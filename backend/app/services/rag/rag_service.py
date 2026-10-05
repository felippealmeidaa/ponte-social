import os
from typing import List, Dict, Any, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Base de Conhecimento Estruturada de Equipamentos e Serviços Públicos (Anápolis - GO)
# ATENÇÃO: nomes, endereços, telefones e bairros abaixo são EXEMPLOS do protótipo e NÃO foram
# conferidos com a Prefeitura de Anápolis. Usado só pelos protótipos da fase 2 (HABILITAR_FASE2).
# Antes de qualquer uso com o público, substituir pela lista oficial de CRAS/CREAS do município.
UNIDADES_CRAS_CREAS = [
    {
        "id": "cras-norte",
        "nome": "CRAS Norte - Vila Jaiara",
        "tipo": "CRAS",
        "endereco": "Av. Fernando Costa, nº 1240, Vila Jaiara, Anápolis - GO",
        "bairros_atendidos": ["Vila Jaiara", "Recanto do Sol", "Vila Harmonia", "Setor Sul", "Jardim Alexandrina"],
        "telefone": "(62) 3902-1200",
        "horario": "Segunda a Sexta, das 08h às 17h",
        "servicos": ["Cadastro Único", "Bolsa Família", "Cesta Básica", "Auxílio Natalidade", "Atendimento Psicológico Social"]
    },
    {
        "id": "cras-sul",
        "nome": "CRAS Sul - Vivian Parque",
        "tipo": "CRAS",
        "endereco": "Rua VP-15, Qd. 22, Vivian Parque, Anápolis - GO",
        "bairros_atendidos": ["Vivian Parque", "Calixtolândia", "Jundiaí", "Bela Vista", "Santa Maria"],
        "telefone": "(62) 3902-1350",
        "horario": "Segunda a Sexta, das 08h às 17h",
        "servicos": ["Cadastro Único", "Bolsa Família", "BPC LOAS", "Carteira do Idoso", "Oficinas de Convivência"]
    },
    {
        "id": "cras-leste",
        "nome": "CRAS Leste - Jardim Alvorada",
        "tipo": "CRAS",
        "endereco": "Av. JK, nº 880, Jardim Alvorada, Anápolis - GO",
        "bairros_atendidos": ["Jardim Alvorada", "Filostro Machado", "Morumbi", "Vila Formosa"],
        "telefone": "(62) 3902-1420",
        "horario": "Segunda a Sexta, das 08h às 17h",
        "servicos": ["Atualização CadÚnico", "Encaminhamento SINE", "Cesta Básica Emergencial", "Passe Livre PCD"]
    },
    {
        "id": "creas-central",
        "nome": "CREAS - Centro de Referência Especializado de Assistência Social",
        "tipo": "CREAS (Proteção Especial)",
        "endereco": "Rua 14 de Julho, nº 710, Centro, Anápolis - GO",
        "bairros_atendidos": ["Todos os bairros do município de Anápolis"],
        "telefone": "(62) 3902-2800 | Plantão: (62) 99333-1800",
        "horario": "Atendimento Emergencial 24h para Violação de Direitos",
        "servicos": ["Acolhimento de Vítimas de Violência", "Medidas Protetivas", "Casa Abrigo", "Combate ao Abuso e Exploração Infantil", "Apoio a Pessoas Ameaçadas"]
    }
]

class SocialRAGService:
    def __init__(self):
        self.corpus = []
        for u in UNIDADES_CRAS_CREAS:
            doc = f"{u['nome']} {u['tipo']} {u['endereco']} bairros: {' '.join(u['bairros_atendidos'])} serviços: {' '.join(u['servicos'])}"
            self.corpus.append(doc)
        
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2))
        self.doc_vectors = self.vectorizer.fit_transform(self.corpus)

    def search_relevant_unit(self, query: str, bairro: Optional[str] = None) -> Dict[str, Any]:
        busca = f"{query} {bairro}" if bairro else query
        query_vec = self.vectorizer.transform([busca])
        similarities = cosine_similarity(query_vec, self.doc_vectors).flatten()
        
        best_idx = int(similarities.argmax())
        best_unit = UNIDADES_CRAS_CREAS[best_idx].copy()
        best_unit["score_similaridade"] = float(similarities[best_idx])
        return {
            "unidade": best_unit,
            "nome": best_unit["nome"],
            "tipo": best_unit["tipo"],
            "endereco": best_unit["endereco"],
            "telefone": best_unit["telefone"],
            "score_similaridade": float(similarities[best_idx])
        }

    async def search_cras_units(self, bairro_cidadao: str, top_k: int = 3) -> List[Dict[str, Any]]:
        query_vec = self.vectorizer.transform([bairro_cidadao])
        similarities = cosine_similarity(query_vec, self.doc_vectors).flatten()
        
        ranked_indices = similarities.argsort()[::-1][:top_k]
        results = []
        for idx in ranked_indices:
            unit = UNIDADES_CRAS_CREAS[int(idx)].copy()
            unit["score_similaridade"] = float(similarities[idx])
            results.append(unit)
        return results

social_rag_service = SocialRAGService()
rag_service = social_rag_service
