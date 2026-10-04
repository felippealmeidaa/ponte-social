import json
import numpy as np
from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

class SocialClusteringService:
    """
    Módulo de Machine Learning Não-Supervisionado (Clustering).
    Agrupa relatos recebidos para descobrir novos tópicos de demanda da população,
    detectar relatos atípicos/fora de escopo e apoiar gestores públicos na alocação de recursos.
    """
    def __init__(self, n_clusters: int = 4):
        self.n_clusters = n_clusters
        self.vectorizer = TfidfVectorizer(max_features=100, stop_words=None, ngram_range=(1, 2))
        self.kmeans = KMeans(n_clusters=self.n_clusters, random_state=42, n_init=10)

    def fit_and_cluster_relatos(self, relatos: List[str]) -> Dict[str, Any]:
        if len(relatos) < self.n_clusters:
            return {"status": "error", "message": "Número de relatos insuficiente para clusterização."}

        X = self.vectorizer.fit_transform(relatos)
        cluster_labels = self.kmeans.fit_predict(X)
        
        # Redução de dimensionalidade 2D para plotagem no frontend
        pca = PCA(n_components=2, random_state=42)
        coords_2d = pca.fit_transform(X.toarray())

        # Palavras mais representativas de cada cluster
        order_centroids = self.kmeans.cluster_centers_.argsort()[:, ::-1]
        terms = self.vectorizer.get_feature_names_out()
        
        clusters_info = []
        for i in range(self.n_clusters):
            top_words = [terms[ind] for ind in order_centroids[i, :5]]
            count_samples = int(np.sum(cluster_labels == i))
            clusters_info.append({
                "cluster_id": i,
                "nome_sugerido": f"Grupo {i+1}: {', '.join(top_words[:3])}",
                "top_keywords": top_words,
                "total_relatos": count_samples,
                "pct_relativa": round((count_samples / len(relatos)) * 100, 1)
            })

        points = []
        for idx, (label, coord) in enumerate(zip(cluster_labels, coords_2d)):
            points.append({
                "id": idx,
                "texto": relatos[idx][:80] + "...",
                "cluster_id": int(label),
                "x": float(coord[0]),
                "y": float(coord[1])
            })

        return {
            "status": "success",
            "total_analisado": len(relatos),
            "clusters": clusters_info,
            "scatter_points": points
        }

social_clustering_service = SocialClusteringService()
