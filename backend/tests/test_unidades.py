"""Bairro → CRAS: com unidades cadastradas no painel, o bot pergunta o bairro e indica a unidade."""
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar

CRAS_TESTE = {
    "nome": "CRAS Teste Norte", "tipo": "CRAS", "endereco": "Rua Exemplo, 100", "telefone": "(62) 0000-0000",
    "horario": "Seg a sex, 8h às 17h", "bairros": ["Vila Jaiara", "Recanto do Sol", " ", "vila jaiara"],
    "fonte": "https://exemplo.gov.br/cras", "verificado_em": "2026-10-01",
}
CREAS_TESTE = {"nome": "CREAS Teste", "tipo": "CREAS", "endereco": "Av. Exemplo, 50", "telefone": "(62) 1111-1111"}


def _conversa(client, telefone, *mensagens):
    return [client.post("/api/v1/webhooks/simular", json={"telefone": telefone, "texto": t}).json()["respostas"] for t in mensagens]


@contextmanager
def _unidades(client, *dados):
    criadas = []
    try:
        for d in dados:
            r = client.post("/api/v1/configuracao/unidades", json=d)
            assert r.status_code == 200, r.text
            criadas.append(r.json())
        yield criadas
    finally:  # o banco de testes é compartilhado: não deixa unidades para os outros testes
        for u in criadas:
            client.delete(f"/api/v1/configuracao/unidades/{u['id']}")


def test_cadastro_de_unidade_limpa_bairros_e_valida():
    with TestClient(app) as client:
        autenticar(client)
        with _unidades(client, CRAS_TESTE) as (cras,):
            assert cras["bairros"] == ["Vila Jaiara", "Recanto do Sol"]  # sem vazios nem repetidos
        sem_bairro = client.post("/api/v1/configuracao/unidades", json={**CRAS_TESTE, "bairros": []})
        assert sem_bairro.status_code == 422
        futuro = client.post("/api/v1/configuracao/unidades", json={**CRAS_TESTE, "verificado_em": "2999-01-01"})
        assert futuro.status_code == 422


def test_busca_por_bairro_tolera_acento_e_erro_de_digitacao():
    with TestClient(app) as client:
        autenticar(client)
        with _unidades(client, CRAS_TESTE):
            for bairro in ["vila jaiara", "Vila Jaiára", "vila jaiaira", "bairro recanto do sol"]:
                achado = client.get("/api/v1/configuracao/unidades/buscar", params={"bairro": bairro}).json()["unidade"]
                assert achado and achado["nome"] == "CRAS Teste Norte", bairro
            assert client.get("/api/v1/configuracao/unidades/buscar", params={"bairro": "Jundiaí"}).json()["unidade"] is None


def test_sem_cras_cadastrado_o_bot_nao_pergunta_bairro():
    with TestClient(app) as client:
        autenticar(client)
        r = _conversa(client, "5562933330001", "oi", "1", "perdi minha identidade e preciso tirar outra", "1")
        assert "Documentos para levar" in r[3][0]


def test_bot_pergunta_bairro_indica_cras_e_grava_na_triagem():
    with TestClient(app) as client:
        autenticar(client)
        with _unidades(client, CRAS_TESTE):
            antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
            r = _conversa(client, "5562933330002", "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "vila jaiara", "1")
            assert "bairro" in r[3][0]
            assert "CRAS do seu bairro:* *CRAS Teste Norte* — Rua Exemplo, 100" in r[4][0]
            nova = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)
            assert nova["bairro"] == "vila jaiara"

            # na próxima conversa o bairro já é conhecido: não pergunta de novo
            r = _conversa(client, "5562933330002", "preciso atualizar o cadastro unico da minha familia", "1")
            assert "CRAS Teste Norte" in r[1][0]


def test_bairro_desconhecido_ou_nao_sei():
    with TestClient(app) as client:
        autenticar(client)
        with _unidades(client, CRAS_TESTE):
            r = _conversa(client, "5562933330003", "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "Jundiaí")
            assert "Não encontrei o CRAS do seu bairro" in r[4][0] and "Documentos para levar" in r[4][0]
            r = _conversa(client, "5562933330004", "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "não sei")
            assert "CRAS do seu bairro" not in r[4][0] and "Não encontrei" not in r[4][0]


def test_emergencia_mostra_creas_cadastrado():
    with TestClient(app) as client:
        autenticar(client)
        with _unidades(client, CREAS_TESTE):
            r = _conversa(client, "5562933330005", "meu marido me agrediu e estou com medo")
            assert "190" in r[0][0] and "CREAS Teste" in r[0][0] and "Av. Exemplo, 50" in r[0][0]
