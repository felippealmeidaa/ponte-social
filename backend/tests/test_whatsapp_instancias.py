"""Rota de status da instância do WhatsApp (tela Configurações → WhatsApp)."""
from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar

client = TestClient(app)


def test_whatsapp_instance_status():
    autenticar(client)
    resp = client.get("/api/v1/whatsapp/status?instance_name=cras-anapolis")
    assert resp.status_code == 200
    assert "connected" in resp.json()
