"""Modo demonstração: casos fictícios só entram nos números com o modo ligado e nunca se misturam aos reais."""
from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.services.ml import retreino
from conftest import autenticar

DEMO = "/api/v1/demonstracao"
OPCOES = "/api/v1/configuracao/fluxo/opcoes"
RESUMO = "/api/v1/triagem/indicadores/resumo"


def test_gerar_contar_e_apagar_exemplos():
    with TestClient(app) as client:
        autenticar(client)
        try:
            client.delete(DEMO)
            antes_reais = client.get(RESUMO).json()["total"]

            async def reais():
                async with abrir_sessao() as session:
                    return await retreino.exemplos_reais(session)
            treino_antes = client.portal.call(reais)
            r = client.post(f"{DEMO}/gerar", json={"quantos": 40}).json()
            assert r["criados"] == 40 and r["exemplos"] == 40
            # Modo desligado: os números não mudam
            assert client.get(RESUMO).json()["total"] == antes_reais
            assert client.get(DEMO).json() == {"ligado": False, "exemplos": 40, "maximo": 300}
            assert not any(t["canal"] == "demo" for t in client.get("/api/v1/triagem/fila").json())  # fila só com reais

            # Modo ligado: os exemplos dos últimos 30 dias entram
            client.put(OPCOES, json={"opcoes": {"modo_demonstracao": True}})
            assert client.get(RESUMO).json()["total"] == antes_reais + 40
            assert client.get(DEMO).json()["ligado"] is True
            assert sum(t["canal"] == "demo" for t in client.get("/api/v1/triagem/fila").json()) == 40

            # Exemplo nunca vira dado de treino: gerar 40 casos não muda os exemplos de treino
            assert client.portal.call(reais) == treino_antes

            # Apagar remove só canal demo
            assert client.delete(DEMO).json()["apagados"] >= 40
            assert client.get(DEMO).json()["exemplos"] == 0
            assert client.get(RESUMO).json()["total"] == antes_reais
        finally:
            client.put(OPCOES, json={"opcoes": {"modo_demonstracao": False}})
            client.delete(DEMO)


def test_limites_e_permissao():
    with TestClient(app) as client:
        autenticar(client)
        assert client.post(f"{DEMO}/gerar", json={"quantos": 0}).status_code == 422
        assert client.post(f"{DEMO}/gerar", json={"quantos": 301}).status_code == 422
        # Só a secretaria liga o modo (não dá para ligar só num CRAS)
        from app.services import catalogo
        assert catalogo.validar_opcoes({"modo_demonstracao": True}, "uni-qualquer") is not None
