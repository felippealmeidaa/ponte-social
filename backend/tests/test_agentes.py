"""Agentes: cadastro, trava de violência, ferramentas permitidas e limite de passos (Gemini simulado)."""
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services import catalogo
from app.services.agentes import executor
from conftest import autenticar

INSTRUCOES = "Você orienta sobre alimentação e cesta básica. Responda em até três frases."


def _criar(client, ferramentas=("servicos_da_necessidade",)):
    r = client.post("/api/v1/agentes", json={"nome": f"Agente {uuid.uuid4().hex[:4]}", "instrucoes": INSTRUCOES,
                                             "temperatura": 0.3, "ferramentas": list(ferramentas)})
    assert r.status_code == 201, r.text
    return r.json()


def test_cadastro_e_validacao():
    with TestClient(app) as client:
        autenticar(client)
        lista = client.get("/api/v1/agentes").json()
        assert {f["id"] for f in lista["ferramentas"]} >= {"buscar_base_conhecimento", "servicos_da_necessidade", "cras_do_bairro", "lugares_da_rede"}
        assert client.post("/api/v1/agentes", json={"nome": "x", "instrucoes": "curta", "ferramentas": []}).status_code == 422
        assert client.post("/api/v1/agentes", json={"nome": "x", "instrucoes": INSTRUCOES, "ferramentas": ["mandar_whatsapp"]}).status_code == 422
        a = _criar(client)
        r = client.put(f"/api/v1/agentes/{a['id']}", json={**a, "temperatura": 0.8, "ferramentas": ["cras_do_bairro"]})
        assert r.status_code == 200 and r.json()["ferramentas"] == ["cras_do_bairro"] and r.json()["temperatura"] == 0.8
        assert client.delete(f"/api/v1/agentes/{a['id']}").status_code == 200
        assert client.post(f"/api/v1/agentes/{a['id']}/testar", json={"mensagem": "oi"}).status_code == 404


def test_violencia_nao_passa_pelo_agente(monkeypatch):
    chamou = []
    monkeypatch.setattr(executor, "_gemini", lambda payload: chamou.append(payload))
    with TestClient(app) as client:
        autenticar(client)
        a = _criar(client)
        r = client.post(f"/api/v1/agentes/{a['id']}/testar", json={"mensagem": "meu marido me bateu e disse que vai me matar"}).json()
        assert r["violencia"] is True and r["resposta"] == catalogo.texto("emergencia") and not chamou


def test_sem_chave_do_gemini_avisa():
    with TestClient(app) as client:
        autenticar(client)
        a = _criar(client)
        r = client.post(f"/api/v1/agentes/{a['id']}/testar", json={"mensagem": "onde pego cesta basica?"})
        assert r.status_code == 503 and "chave do Gemini" in r.json()["detail"]


def test_ciclo_de_ferramentas_e_travas(monkeypatch):
    monkeypatch.setattr(executor.settings, "GEMINI_API_KEY", "chave-de-teste")
    roteiro = [
        {"candidates": [{"content": {"role": "model", "parts": [
            {"functionCall": {"name": "servicos_da_necessidade", "args": {"necessidade": "alimentacao"}}},
            {"functionCall": {"name": "lugares_da_rede", "args": {"necessidade": "alimentacao"}}},  # não permitida
        ]}}]},
        {"candidates": [{"content": {"role": "model", "parts": [{"text": "Procure o CRAS do seu bairro com seus documentos."}]}}]},
    ]
    enviados = []

    async def gemini_falso(payload):
        enviados.append(payload)
        return roteiro[len(enviados) - 1]

    monkeypatch.setattr(executor, "_gemini", gemini_falso)
    with TestClient(app) as client:
        autenticar(client)
        a = _criar(client)
        r = client.post(f"/api/v1/agentes/{a['id']}/testar", json={"mensagem": "to sem comida em casa, meu cpf 123.456.789-09",
                                                                     "historico": [{"autor": "pessoa", "texto": "oi"}, {"autor": "agente", "texto": "Olá!"}]}).json()
    assert r["resposta"].startswith("Procure o CRAS") and r["violencia"] is False
    assert [p["ferramenta"] for p in r["passos"]] == ["servicos_da_necessidade", "lugares_da_rede"]
    assert r["passos"][0]["permitida"] and r["passos"][0]["resultado"]["servicos"]
    assert not r["passos"][1]["permitida"] and "não permitida" in r["passos"][1]["resultado"]["erro"]
    # só as ferramentas do agente são oferecidas ao Gemini, e o CPF não chega à IA
    nomes = [d["name"] for d in enviados[0]["tools"][0]["functionDeclarations"]]
    assert nomes == ["servicos_da_necessidade"] and "123.456" not in str(enviados[0]["contents"])
    assert enviados[0]["contents"][0]["role"] == "user" and enviados[0]["contents"][1]["role"] == "model"


def test_limite_de_passos(monkeypatch):
    monkeypatch.setattr(executor.settings, "GEMINI_API_KEY", "chave-de-teste")

    async def gemini_teimoso(payload):  # sempre pede outra ferramenta
        return {"candidates": [{"content": {"role": "model", "parts": [
            {"functionCall": {"name": "cras_do_bairro", "args": {"bairro": "Centro"}}}]}}]}

    monkeypatch.setattr(executor, "_gemini", gemini_teimoso)
    with TestClient(app) as client:
        autenticar(client)
        a = _criar(client, ferramentas=("cras_do_bairro",))
        r = client.post(f"/api/v1/agentes/{a['id']}/testar", json={"mensagem": "qual o cras do centro?"}).json()
    assert r.get("limite") is True and len(r["passos"]) == executor.MAX_PASSOS
