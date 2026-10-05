"""
Regras de texto compartilhadas entre o treino e a inferência:
- normalização (minúsculas, sem acento) para que "ameaça" e "ameaca" sejam iguais;
- linha de base heurística por palavras-chave;
- rede de segurança de violência, que roda ANTES do modelo.

Convenção dos termos: casam sempre no início de palavra. Termo terminado em "*"
é radical ("agred*" casa "agrediu", "agredindo"); sem "*" precisa ser a palavra
inteira ("rg" não casa dentro de "urgente").
"""
import re
import unicodedata
from typing import Dict, List, Optional


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


# Termos tirados SÓ da lista original e do vocabulário das frases de treino. Não acrescentar
# termos vistos no conjunto de teste (data/relatos_teste_informais.json): isso vaza o teste para a
# linha de base. Ampliar a lista com um profissional exige um conjunto de teste novo.
KEYWORDS_HEURISTIC: Dict[str, List[str]] = {
    "violencia_protecao": [
        "agred*", "agress*", "ameac*", "bateu", "espanc*", "apanh*", "violenc*", "abus*", "maltrat*",
        "medida protetiva",
    ],
    "renda_beneficio": [
        "bolsa familia", "bpc", "loas", "auxilio*", "beneficio*", "dinheiro", "renda", "sustentar",
        "financeir*", "tarifa social",
    ],
    "cadastro_atualizacao": [
        "cadunico", "cadastro unico", "nis", "recadastr*", "atualizar", "atualizacao cadastral", "folha resumo",
    ],
    "moradia": [
        "morar", "moradia", "aluguel", "despej*", "desab*", "abrigo", "situacao de rua", "barraco",
        "defesa civil", "enchente", "casas populares",
    ],
    "documentacao": [
        "rg", "identidade", "certidao", "registr*", "cpf", "segunda via", "2a via", "cartorio", "documento*",
    ],
    "alimentacao": [
        "comida", "comer", "fome", "cesta basica", "leite", "aliment*", "restaurante popular",
    ],
    "pessoa_idosa_pcd": [
        "idos*", "deficien*", "pcd", "cadeira de rodas", "fralda*", "autis*", "tea", "passe livre",
    ],
    "trabalho_renda": [
        "emprego", "trabalho", "vaga*", "curriculo", "curso*", "capacitacao", "qualificacao", "sine",
        "mei", "empreend*", "aprendiz",
    ],
}


def _compilar(termos: List[str]) -> re.Pattern:
    partes = []
    for termo in termos:
        if termo.endswith("*"):
            partes.append(r"\b" + re.escape(termo[:-1]))
        else:
            partes.append(r"\b" + re.escape(termo) + r"\b")
    return re.compile("|".join(partes))


_PADROES = {cat: _compilar(termos) for cat, termos in KEYWORDS_HEURISTIC.items()}


def detectar_violencia(texto: str) -> bool:
    return bool(_PADROES["violencia_protecao"].search(normalizar(texto)))


def predict_heuristic(texto: str) -> Optional[str]:
    """Primeira categoria cuja lista casa (violência tem prioridade). None se nada casar."""
    texto_norm = normalizar(texto)
    for cat, padrao in _PADROES.items():
        if padrao.search(texto_norm):
            return cat
    return None
