"""Fluxo personalizável: posições dos quadradinhos e mensagens extras que o bot envia antes de uma etapa."""
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar
from test_unidades import conversa, cras_teste, telefone, unidades

URL = "/api/v1/configuracao/fluxo/desenho"


@contextmanager
def desenho(client, dados, unidade=None):
    """O banco de testes é compartilhado: volta ao que era no fim."""
    url = URL + (f"?unidade={unidade}" if unidade else "")
    r = client.put(url, json=dados)
    assert r.status_code == 200, r.text
    try:
        yield r.json()
    finally:
        client.put(url, json={"posicoes": None, "extras": None})


def test_extra_vai_antes_da_etapa_escolhida():
    with TestClient(app) as client:
        autenticar(client)
        extras = [{"antes_de": "relato", "titulo": "Horário", "texto": "O CRAS atende de segunda a sexta."},
                  {"antes_de": "caminho", "texto": "Leve os documentos originais."}]
        with desenho(client, {"extras": extras}) as salvo:
            assert [e["antes_de"] for e in salvo["extras"]] == ["relato", "caminho"]
            assert salvo["extras"][1]["titulo"] == "Mensagem extra" and salvo["extras"][0]["id"]
            r = conversa(client, telefone(), "oi", "1", "perdi minha identidade e preciso tirar outra", "1")
            assert r[1][0] == "O CRAS atende de segunda a sexta." and "conte" in r[1][1].lower()
            assert r[3][0] == "Leve os documentos originais." and "Documentos para levar" in r[3][1]


def test_nao_aceita_extra_antes_do_aceite_nem_na_violencia_nem_vazia():
    with TestClient(app) as client:
        autenticar(client)
        for antes_de in ["boas_vindas", "emergencia", "violencia"]:
            r = client.put(URL, json={"extras": [{"antes_de": antes_de, "texto": "oi"}]})
            assert r.status_code == 422, antes_de
        assert client.put(URL, json={"extras": [{"antes_de": "relato", "texto": "  "}]}).status_code == 422
        assert client.put(URL, json={"posicoes": {"relato": {"x": "a", "y": 1}}}).status_code == 422


def test_posicoes_salvam_e_cras_herda_da_secretaria_ate_mexer():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            with desenho(client, {"posicoes": {"relato": {"x": 410.6, "y": 120}},
                                  "extras": [{"antes_de": "relato", "texto": "Extra da secretaria"}]}):
                herdado = client.get(f"{URL}?unidade={cras['id']}").json()
                assert herdado["posicoes"] == {"relato": {"x": 411, "y": 120}} and not herdado["posicoes_proprias"]
                assert herdado["extras"][0]["texto"] == "Extra da secretaria"
                with desenho(client, {"extras": []}, unidade=cras["id"]) as proprio:
                    assert proprio["extras"] == [] and proprio["extras_proprias"]
                    # quem mora no bairro deste CRAS não recebe a extra da secretaria
                    r = conversa(client, telefone(), "oi", "1", "vila jaiara")
                    assert "Extra da secretaria" not in r[2]
