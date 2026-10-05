"""Bairro → CRAS: com unidades cadastradas, o bot pergunta o bairro logo depois do aceite e passa a
seguir o fluxo daquele CRAS."""
import uuid
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar


def cras_teste(**extra):
    base = {
        "nome": "CRAS Teste Norte", "tipo": "CRAS", "endereco": "Rua Exemplo, 100", "telefone": "(62) 0000-0000",
        "horario": "Seg a sex, 8h às 17h", "bairros": ["Vila Jaiara", "Recanto do Sol", " ", "vila jaiara"],
        "fonte": "https://exemplo.gov.br/cras", "verificado_em": "2026-10-01",
    }
    return {**base, **extra}


CREAS_TESTE = {"nome": "CREAS Teste", "tipo": "CREAS", "endereco": "Av. Exemplo, 50", "telefone": "(62) 1111-1111"}


def telefone():
    return "55629" + uuid.uuid4().hex[:8].translate(str.maketrans("abcdef", "123456"))


def conversa(client, tel, *mensagens):
    return [client.post("/api/v1/webhooks/simular", json={"telefone": tel, "texto": t}).json()["respostas"] for t in mensagens]


@contextmanager
def unidades(client, *dados):
    criadas = []
    try:
        for d in dados:
            r = client.post("/api/v1/configuracao/unidades", json=d)
            assert r.status_code == 200, r.text
            criadas.append(r.json())
        yield criadas
    finally:
        # O banco de testes é compartilhado: remove a unidade, ou desativa se ela tiver contas/casos ligados,
        # para não fazer o bot perguntar o bairro nos outros testes.
        for u in criadas:
            if client.delete(f"/api/v1/configuracao/unidades/{u['id']}").status_code != 200:
                client.put(f"/api/v1/configuracao/unidades/{u['id']}", json={**u, "ativo": False})


def test_cadastro_de_unidade_limpa_bairros_e_valida():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            assert cras["bairros"] == ["Vila Jaiara", "Recanto do Sol"]  # sem vazios nem repetidos
        assert client.post("/api/v1/configuracao/unidades", json=cras_teste(bairros=[])).status_code == 422
        assert client.post("/api/v1/configuracao/unidades", json=cras_teste(verificado_em="2999-01-01")).status_code == 422


def test_busca_por_bairro_tolera_acento_e_erro_de_digitacao():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()):
            for bairro in ["vila jaiara", "Vila Jaiára", "vila jaiaira", "bairro recanto do sol"]:
                achado = client.get("/api/v1/configuracao/unidades/buscar", params={"bairro": bairro}).json()["unidade"]
                assert achado and achado["nome"] == "CRAS Teste Norte", bairro
            assert client.get("/api/v1/configuracao/unidades/buscar", params={"bairro": "Jundiaí"}).json()["unidade"] is None


def test_sem_cras_cadastrado_o_bot_nao_pergunta_bairro():
    with TestClient(app) as client:
        autenticar(client)
        r = conversa(client, telefone(), "oi", "1", "perdi minha identidade e preciso tirar outra", "1")
        assert "conte" in r[1][0].lower()
        assert "Documentos para levar" in r[3][0]


def test_bairro_vem_logo_depois_do_aceite_e_define_o_cras():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            tel = telefone()
            antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
            r = conversa(client, tel, "oi", "1", "vila jaiara", "perdi minha identidade e preciso tirar outra", "1", "1")
            assert "bairro" in r[1][0]
            assert "CRAS Teste Norte" in r[2][0] and "conte" in r[2][0].lower()
            assert "CRAS do seu bairro:* *CRAS Teste Norte* — Rua Exemplo, 100" in r[4][0]
            nova = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)
            assert nova["bairro"] == "vila jaiara" and nova["unidade_id"] == cras["id"]

            # na próxima conversa o bairro já é conhecido: não pergunta de novo
            r = conversa(client, tel, "preciso atualizar o cadastro unico da minha familia", "1")
            assert "CRAS Teste Norte" in r[1][0]


def test_bairro_desconhecido_ou_nao_sei_segue_o_padrao_da_secretaria():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()):
            r = conversa(client, telefone(), "oi", "1", "Jundiaí")
            assert "Não encontrei o CRAS do seu bairro" in r[2][0] and "conte" in r[2][0].lower()
            r = conversa(client, telefone(), "oi", "1", "não sei")
            assert "Não encontrei" not in r[2][0] and "conte" in r[2][0].lower()


def test_emergencia_mostra_creas_cadastrado():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CREAS_TESTE):
            r = conversa(client, telefone(), "meu marido me agrediu e estou com medo")
            assert "190" in r[0][0] and "CREAS Teste" in r[0][0] and "Av. Exemplo, 50" in r[0][0]
