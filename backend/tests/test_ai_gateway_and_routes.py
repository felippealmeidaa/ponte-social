import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_ai_gateway_predict():
    response = client.post(
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
    response = client.post(
        "/api/v1/models/predict",
        json={"text": "Estou sofrendo agressão do meu marido e preciso de medida protetiva urgente socorro"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_emergency"] is True
    assert data["category_key"] == "violencia_protecao"

def test_ai_gateway_hybrid_route():
    response = client.post(
        "/api/v1/models/route",
        json={"text": "Gostaria de saber onde fica o CRAS do Recanto do Sol", "confidence_threshold": 0.8}
    )
    assert response.status_code == 200
    data = response.json()
    assert "routed_to" in data
    assert "latency_ms" in data

def test_api_keys_flow():
    # List keys
    list_resp = client.get("/api/v1/api-keys")
    assert list_resp.status_code == 200
    assert "keys" in list_resp.json()
    
    # Create key
    create_resp = client.post(
        "/api/v1/api-keys",
        json={"name": "Chave Teste Integração", "app_id": "social-cras"}
    )
    assert create_resp.status_code == 200
    created_key = create_resp.json()["key"]
    assert created_key["full_key"].startswith("sk_live_")

def test_knowledge_base_endpoints():
    # List documents
    list_resp = client.get("/api/v1/knowledge")
    assert list_resp.status_code == 200
    assert "documents" in list_resp.json()
    
    # Query vector search
    query_resp = client.post(
        "/api/v1/knowledge/query",
        json={"query": "Recanto do Sol", "top_k": 2}
    )
    assert query_resp.status_code == 200
    assert "results" in query_resp.json()

def test_whatsapp_instance_status():
    resp = client.get("/api/v1/whatsapp/status?instance_name=cras-anapolis")
    assert resp.status_code == 200
    assert "connected" in resp.json()

def test_apps_workspace_endpoints():
    resp = client.get("/api/v1/apps")
    assert resp.status_code == 200
    assert len(resp.json()["apps"]) >= 1
