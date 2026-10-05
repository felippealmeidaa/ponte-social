import json

from app.services.ml.text_rules import detectar_violencia, normalizar, predict_heuristic
from app.services.ml.train_evaluator import TEST_PATH, carregar_teste, carregar_treino
from app.services.ml.classifier_service import SocialClassifierService


def test_normalizar_remove_acentos():
    assert normalizar("Ameaça  de VIOLÊNCIA") == "ameaca de violencia"


def test_palavra_curta_nao_casa_dentro_de_outra():
    # "rg" (documentação) não pode casar dentro de "urgente"
    assert predict_heuristic("preciso urgente de uma cesta basica") == "alimentacao"


def test_socorro_alimentar_nao_e_violencia():
    assert detectar_violencia("Estamos sem alimentos e sem gás de cozinha, onde peço socorro alimentar?") is False


def test_violencia_com_acento_e_sem_acento():
    assert detectar_violencia("ele me agrediu ontem")
    assert detectar_violencia("estou sendo ameaçada")
    assert detectar_violencia("estou sendo ameacada")


def test_treino_sem_duplicatas_e_com_grupos():
    df = carregar_treino()
    assert df["texto"].is_unique
    # variações da mesma frase-modelo (só muda o número) caem no mesmo grupo
    assert df["grupo"].nunique() < len(df)


def test_teste_nunca_aparece_no_treino():
    treino = set(normalizar(t) for t in carregar_treino()["texto"])
    teste = set(normalizar(t) for t in carregar_teste()["texto"])
    assert treino.isdisjoint(teste)


def test_conjunto_de_teste_marcado_como_simulado():
    with open(TEST_PATH, encoding="utf-8") as f:
        assert "simulado" in json.load(f)["_origem"]


def test_violencia_sempre_urgente():
    res = SocialClassifierService.classify_relato("meu companheiro me espancou e estou com medo")
    assert res["categoria"] == "violencia_protecao"
    assert res["prioridade"] == "URGENTE_VIOLENCIA"
    assert res["is_urgente"] is True


def test_relato_sem_sentido_nao_inventa_categoria():
    res = SocialClassifierService.classify_relato("kkkkk bom dia")
    assert res["categoria"] == "nao_identificado"
    assert "121" in res["contato_util"]
