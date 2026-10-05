"""Contas do painel: coordenação gerencia a equipe; conta desativada perde o acesso na hora."""
import uuid

from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar


def _login(client, login, senha):
    return client.post("/api/v1/auth/login", json={"username_or_email": login, "password": senha})


def _nova_conta(client, papel="ATENDENTE", senha="senha-forte-1"):
    login = f"ana{uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/equipe", json={"login": login, "nome": "Ana Atendente", "senha": senha, "papel": papel})
    assert r.status_code == 200, r.text
    return login, r.json()


def test_usuarios_nao_estao_mais_no_codigo():
    import app.api.v1.endpoints.auth as auth
    assert not hasattr(auth, "USERS_DB")
    with TestClient(app) as client:
        for login, senha in [("admin@cras.gov.br", "admin123"), ("atendente@cras.gov.br", "senha123")]:
            assert _login(client, login, senha).status_code == 401


def test_coordenacao_cria_conta_e_atendente_entra_sem_poder_gerenciar():
    with TestClient(app) as client:
        autenticar(client)
        login, conta = _nova_conta(client)
        assert conta["role"] == "ATENDENTE" and "senha_hash" not in conta

        atendente = TestClient(app)
        r = _login(atendente, login.upper(), "senha-forte-1")  # login não diferencia maiúsculas
        assert r.status_code == 200
        atendente.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        assert atendente.get("/api/v1/triagem/fila").status_code == 200
        assert atendente.get("/api/v1/equipe").status_code == 403


def test_senha_curta_e_login_repetido_sao_recusados():
    with TestClient(app) as client:
        autenticar(client)
        r = client.post("/api/v1/equipe", json={"login": "curta", "nome": "Fulano", "senha": "123", "papel": "ATENDENTE"})
        assert r.status_code == 422 and "8 caracteres" in r.json()["detail"]
        login, _ = _nova_conta(client)
        r = client.post("/api/v1/equipe", json={"login": login, "nome": "Outro", "senha": "senha-forte-1"})
        assert r.status_code == 422


def test_conta_desativada_perde_acesso_na_hora():
    with TestClient(app) as client:
        autenticar(client)
        login, conta = _nova_conta(client)
        atendente = TestClient(app)
        token = _login(atendente, login, "senha-forte-1").json()["access_token"]
        atendente.headers["Authorization"] = f"Bearer {token}"
        assert atendente.get("/api/v1/triagem/fila").status_code == 200

        client.patch(f"/api/v1/equipe/{conta['id']}", json={"ativo": False})
        assert atendente.get("/api/v1/triagem/fila").status_code == 401   # mesmo token, já não vale
        assert _login(TestClient(app), login, "senha-forte-1").status_code == 401


def test_troca_e_redefinicao_de_senha():
    with TestClient(app) as client:
        autenticar(client)
        login, conta = _nova_conta(client)
        pessoa = TestClient(app)
        pessoa.headers["Authorization"] = f"Bearer {_login(pessoa, login, 'senha-forte-1').json()['access_token']}"

        errada = pessoa.post("/api/v1/auth/trocar-senha", json={"senha_atual": "nao-e-essa", "nova_senha": "outra-senha-2"})
        assert errada.status_code == 422
        assert pessoa.post("/api/v1/auth/trocar-senha", json={"senha_atual": "senha-forte-1", "nova_senha": "outra-senha-2"}).status_code == 200
        assert _login(TestClient(app), login, "outra-senha-2").status_code == 200

        assert client.post(f"/api/v1/equipe/{conta['id']}/senha", json={"nova_senha": "redefinida-3"}).status_code == 200
        assert _login(TestClient(app), login, "redefinida-3").status_code == 200


def test_sistema_nunca_fica_sem_coordenacao():
    with TestClient(app) as client:
        autenticar(client)
        eu = client.get("/api/v1/auth/eu").json()
        outras = [u for u in client.get("/api/v1/equipe").json() if u["role"] == "ADMIN" and u["ativo"] and u["id"] != eu["id"]]
        for u in outras:  # deixa só a conta de teste como coordenação
            client.patch(f"/api/v1/equipe/{u['id']}", json={"ativo": False})
        r = client.patch(f"/api/v1/equipe/{eu['id']}", json={"papel": "ATENDENTE"})
        assert r.status_code == 422 and "coordenação" in r.json()["detail"]
        assert client.patch(f"/api/v1/equipe/{eu['id']}", json={"ativo": False}).status_code == 422
