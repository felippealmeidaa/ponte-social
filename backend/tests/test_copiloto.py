"""Copiloto: proposta de fluxo validada (com uma rodada de correção), ajuste do fluxo atual e proposta de agente."""
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services import copiloto
from conftest import autenticar

FLUXO_BOM = {
    "nome": "CRAS do bairro", "descricao": "Pergunta o bairro e indica o CRAS",
    "etapas": [{"id": "inicio", "tipo": "inicio", "titulo": "Início"},
               {"id": "bairro", "tipo": "pergunta", "titulo": "Bairro", "texto": "Em que bairro você mora?", "opcoes": ["Centro", "Vila Jaiara"], "variavel": "bairro"},
               {"id": "cras", "tipo": "ferramenta", "titulo": "Procura o CRAS", "ferramenta": "cras_do_bairro", "argumentos": {"bairro": "{{bairro}}"}, "variavel": "cras"},
               {"id": "fim", "tipo": "fim", "titulo": "Fim", "texto": "Procure o CRAS do seu bairro."}],
    "ligacoes": [{"de": "inicio", "saida": "proximo", "para": "bairro"}, {"de": "bairro", "saida": "opcao:1", "para": "cras"},
                 {"de": "bairro", "saida": "opcao:2", "para": "cras"}, {"de": "bairro", "saida": "outra", "para": "cras"},
                 {"de": "cras", "saida": "proximo", "para": "fim"}],
}


def test_fluxo_com_correcao_e_ajuste(monkeypatch):
    chamadas = []

    async def gemini(prompt, texto, schema):
        chamadas.append(texto)
        if len(chamadas) == 1:  # primeira proposta esquece o caminho de "outra"
            return {**FLUXO_BOM, "ligacoes": [l for l in FLUXO_BOM["ligacoes"] if l["saida"] != "outra"]}
        return {**FLUXO_BOM, "etapas": [{**e, "id": e["id"].upper()} if e["id"] == "fim" else e for e in FLUXO_BOM["etapas"]],
                "ligacoes": [{**l, "para": "FIM"} if l["para"] == "fim" else l for l in FLUXO_BOM["ligacoes"]]}

    monkeypatch.setattr(copiloto, "_gemini", gemini)
    with TestClient(app) as client:
        autenticar(client)
        r = client.post("/api/v1/copiloto/fluxo", json={"pedido": "um fluxo que pergunta o bairro e indica o CRAS"}).json()
        assert r["tentativas"] == 2 and r["problemas"] == [] and "outra resposta" in chamadas[1]
        assert {e["id"] for e in r["proposta"]["etapas"]} == {"inicio", "bairro", "cras", "fim"}  # ids normalizados
        # nada foi salvo: a proposta só vira fluxo quando a tela manda criar
        antes = len(client.get("/api/v1/fluxos").json()["fluxos"])
        criado = client.post("/api/v1/fluxos", json=r["proposta"]).json()
        assert criado["problemas"] == [] and len(client.get("/api/v1/fluxos").json()["fluxos"]) == antes + 1

        chamadas.clear()
        client.post("/api/v1/copiloto/fluxo", json={"pedido": "troque o texto do fim por algo mais acolhedor", "fluxo_id": criado["id"]})
        assert "Fluxo atual" in chamadas[0] and "Procure o CRAS do seu bairro." in chamadas[0]


def test_agente_e_sem_chave(monkeypatch):
    async def gemini(prompt, texto, schema):
        return {"nome": "Documentos", "descricao": "Orienta sobre RG e CPF", "instrucoes": "Você orienta quem precisa tirar documentos.",
                "temperatura": 3, "ferramentas": ["servicos_da_necessidade", "servicos_da_necessidade", "inventada"]}

    with TestClient(app) as client:
        autenticar(client)
        sem = client.post("/api/v1/copiloto/agente", json={"pedido": "um agente que orienta sobre documentos"})
        assert sem.status_code == 503 and "chave do Gemini" in sem.json()["detail"]
        monkeypatch.setattr(copiloto, "_gemini", gemini)
        p = client.post("/api/v1/copiloto/agente", json={"pedido": "um agente que orienta sobre documentos"}).json()["proposta"]
        assert p["temperatura"] == 1.0 and p["ferramentas"] == ["servicos_da_necessidade"]
        assert client.post("/api/v1/agentes", json={**p, "nome": f"{p['nome']} {uuid.uuid4().hex[:3]}"}).status_code == 201
