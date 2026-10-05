import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from app.main import app
from app.api.v1.api import fase2_router
from app.core.deps import usuario_logado

client = TestClient(app)

# Protótipos da fase 2 montados à parte (no app principal ficam desligados por padrão)
app_fase2 = FastAPI()
app_fase2.include_router(fase2_router, prefix="/api/v1")
client_fase2 = TestClient(app_fase2)


def test_fase2_desligada_por_padrao():
    for rota in ("/api/v1/models/logs", "/api/v1/api-keys", "/api/v1/knowledge", "/api/v1/apps", "/api/v1/flows/"):
        assert client.get(rota).status_code == 404, rota


def test_fase2_exige_login_quando_ligada():
    app_protegido = FastAPI()
    app_protegido.include_router(fase2_router, prefix="/api/v1", dependencies=[Depends(usuario_logado)])
    assert TestClient(app_protegido).get("/api/v1/api-keys").status_code == 401


def test_ai_gateway_predict():
    response = client_fase2.post(
        "/api/v1/models/predict",
        json={"text": "Preciso de cesta básica urgente para minha família em Anápolis"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "prediction" in data
    assert "confidence" in data
    assert "latency_ms" in data

def test_ai_gateway_predict_emergency():
    response = client_fase2.post(
        "/api/v1/models/predict",
        json={"text": "Estou sofrendo agressão do meu marido e preciso de medida protetiva urgente socorro"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_emergency"] is True
    assert data["category_key"] == "violencia_protecao"

def test_ai_gateway_hybrid_route():
    response = client_fase2.post(
        "/api/v1/models/route",
        json={"text": "Gostaria de saber onde fica o CRAS do Recanto do Sol", "confidence_threshold": 0.8}
    )
    assert response.status_code == 200
    data = response.json()
    assert "routed_to" in data
    assert "latency_ms" in data

def test_api_keys_flow():
    # List keys
    list_resp = client_fase2.get("/api/v1/api-keys")
    assert list_resp.status_code == 200
    keys = list_resp.json()["keys"]
    assert not any("full_key" in k or "key_hash" in k for k in keys)

    # Create key
    create_resp = client_fase2.post(
        "/api/v1/api-keys",
        json={"name": "Chave Teste Integração", "app_id": "social-cras"}
    )
    assert create_resp.status_code == 200
    created_key = create_resp.json()["key"]
    assert created_key["full_key"].startswith("sk_live_")
    assert "key_hash" not in created_key

def test_knowledge_base_endpoints():
    # List documents
    list_resp = client_fase2.get("/api/v1/knowledge")
    assert list_resp.status_code == 200
    assert "documents" in list_resp.json()

    # Query vector search
    query_resp = client_fase2.post(
        "/api/v1/knowledge/query",
        json={"query": "Recanto do Sol", "top_k": 2}
    )
    assert query_resp.status_code == 200
    assert "results" in query_resp.json()

def test_whatsapp_instance_status():
    from conftest import autenticar
    autenticar(client)
    resp = client.get("/api/v1/whatsapp/status?instance_name=cras-anapolis")
    assert resp.status_code == 200
    assert "connected" in resp.json()

def test_apps_workspace_endpoints():
    resp = client_fase2.get("/api/v1/apps")
    assert resp.status_code == 200
    assert len(resp.json()["apps"]) >= 1
