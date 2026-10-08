"""Temas emergentes: agrupa relatos parecidos sem rótulo, sem violência, e acha um assunto repetido que não é necessidade."""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import Triagem, agora
from app.services.ml import temas
from conftest import autenticar

BASE = {
    "alimentacao": ["to sem comida em casa desde ontem", "precisava de uma cesta basica urgente", "onde pego leite pro bebe"],
    "documentacao": ["perdi minha identidade e preciso tirar outra", "roubaram meus documentos todos", "preciso da certidao de nascimento"],
    "moradia": ["o dono pediu a casa e tenho que sair", "a chuva derrubou o telhado da casa", "nao consigo pagar o aluguel"],
}
ONIBUS = ["nao tenho dinheiro pra passagem de onibus pra ir no medico", "o onibus nao passa mais no meu bairro",
          "preciso de passe de onibus pra levar meu filho na escola"]


def _casos():
    itens = []
    for cat, frases in BASE.items():
        for i in range(12):
            itens.append(Triagem(categoria=cat, relato_anonimizado=frases[i % 3], criado_em=agora() - timedelta(days=i)))
    for i, cat in enumerate(["renda_beneficio", "pessoa_idosa_pcd", "trabalho_renda", "renda_beneficio", "pessoa_idosa_pcd", "trabalho_renda"]):
        itens.append(Triagem(categoria=cat, relato_anonimizado=ONIBUS[i % 3], criado_em=agora() - timedelta(days=1)))
    itens.append(Triagem(categoria="violencia_protecao", relato_anonimizado="meu marido me bate", criado_em=agora()))
    return itens


def test_acha_o_tema_do_onibus_e_deixa_violencia_de_fora():
    res = temas.agrupar(_casos(), 30)
    assert res["suficiente"] and res["casos_analisados"] == 42  # violência não entra
    onibus = next(t for t in res["temas"] if "onibus" in " ".join(t["palavras"]))
    assert onibus["casos"] == 6 and onibus["ultimos_7_dias"] == 6
    assert onibus["varias_necessidades"] and len(onibus["necessidades"]) == 3
    assert not any("bate" in e for t in res["temas"] for e in t["exemplos"])
    assert all(t["casos"] >= temas.MINIMO_POR_TEMA for t in res["temas"])


def test_poucos_casos_nao_agrupa():
    poucos = _casos()[:5]
    assert temas.agrupar(poucos, 30)["suficiente"] is False


def test_rota_dos_temas():
    with TestClient(app) as client:
        autenticar(client)
        r = client.get("/api/v1/triagem/indicadores/temas?dias=30")
        assert r.status_code == 200 and "temas" in r.json() and r.json()["minimo"] == temas.MINIMO_CASOS
