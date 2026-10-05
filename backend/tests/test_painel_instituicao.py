"""Funções do painel do CRAS: login obrigatório, conversas com atendimento humano,
base de serviços editável, contato e indicadores."""
from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar


def _simular(client, telefone, *mensagens):
    ultima = None
    for texto in mensagens:
        r = client.post("/api/v1/webhooks/simular", json={"telefone": telefone, "texto": texto})
        assert r.status_code == 200, r.text
        ultima = r.json()
    return ultima


def test_rotas_do_painel_exigem_login():
    with TestClient(app) as client:
        for rota in ["/api/v1/triagem/fila", "/api/v1/atendimento/conversas", "/api/v1/configuracao/servicos",
                     "/api/v1/ml/metrics", "/api/v1/triagem/indicadores/resumo"]:
            assert client.get(rota).status_code == 401, rota
        assert client.post("/api/v1/webhooks/simular", json={"texto": "oi"}).status_code == 401
        client.headers["Authorization"] = "Bearer token-falso"
        assert client.get("/api/v1/triagem/fila").status_code == 401


def test_webhook_do_whatsapp_continua_aberto():
    with TestClient(app) as client:
        r = client.post("/api/v1/webhooks/evolution", json={"event": "connection.update"})
        assert r.status_code == 200


def test_atendente_assume_responde_e_bot_fica_em_silencio():
    with TestClient(app) as client:
        autenticar(client)
        conversa_id = _simular(client, "5562922220001", "oi", "1")["conversa_id"]

        conversas = client.get("/api/v1/atendimento/conversas").json()
        assert any(c["id"] == conversa_id for c in conversas)

        assert client.post(f"/api/v1/atendimento/conversas/{conversa_id}/assumir").json()["atendimento_humano"] is True
        # com atendente na conversa, o bot não responde
        assert _simular(client, "5562922220001", "preciso de cesta basica para meus filhos")["respostas"] == []

        r = client.post(f"/api/v1/atendimento/conversas/{conversa_id}/responder", json={"texto": "Oi, sou a Ana do CRAS. Pode vir amanhã às 9h?"})
        assert r.json()["enviada"] is True

        historico = client.get(f"/api/v1/atendimento/conversas/{conversa_id}/mensagens").json()["mensagens"]
        autores = [m["autor"] for m in historico]
        assert autores[:2] == ["cidadao", "bot"]
        assert "atendente" in autores
        assert historico[-1]["texto"].startswith("Oi, sou a Ana")
        # só mensagens novas
        ultimo_id = historico[-2]["id"]
        novas = client.get(f"/api/v1/atendimento/conversas/{conversa_id}/mensagens?depois_de={ultimo_id}").json()["mensagens"]
        assert len(novas) == 1

        client.post(f"/api/v1/atendimento/conversas/{conversa_id}/devolver")
        assert "concorda" in _simular(client, "5562922220001", "oi")["respostas"][0]


def test_historico_guarda_mensagem_do_cidadao_anonimizada():
    with TestClient(app) as client:
        autenticar(client)
        conversa_id = _simular(client, "5562922220002", "meu cpf e 123.456.789-01")["conversa_id"]
        textos = [m["texto"] for m in client.get(f"/api/v1/atendimento/conversas/{conversa_id}/mensagens").json()["mensagens"]]
        assert not any("123.456.789-01" in t for t in textos)


def test_cras_edita_servico_e_bot_usa_o_texto_novo():
    with TestClient(app) as client:
        autenticar(client)
        servicos = client.get("/api/v1/configuracao/servicos").json()
        moradia = next(s for s in servicos if s["categoria"] == "moradia")
        novo = {**moradia, "local_atendimento": "CRAS Norte — Rua Exemplo, 100", "documentos": ["RG", "", "Comprovante de residência"]}
        r = client.put("/api/v1/configuracao/servicos/moradia", json=novo)
        assert r.status_code == 200
        assert r.json()["documentos"] == ["RG", "Comprovante de residência"]  # linhas vazias são removidas

        resposta = _simular(client, "5562922220003", "oi", "1", "fui despejada e nao tenho onde morar com meus filhos", "1")["respostas"][0]
        assert "CRAS Norte — Rua Exemplo, 100" in resposta

        restaurado = client.post("/api/v1/configuracao/servicos/moradia/restaurar").json()
        assert restaurado["local_atendimento"] == moradia["local_atendimento"]


def test_servico_registra_fonte_e_data_de_conferencia():
    with TestClient(app) as client:
        autenticar(client)
        servicos = client.get("/api/v1/configuracao/servicos").json()
        doc = next(s for s in servicos if s["categoria"] == "documentacao")
        assert doc["fonte"] == "" and doc["verificado_em"] is None  # padrão: a conferir

        fonte = "https://www.gov.br/mds/pt-br/acoes-e-programas/cadastro-unico"
        r = client.put("/api/v1/configuracao/servicos/documentacao", json={**doc, "fonte": fonte, "verificado_em": "2026-10-01"})
        assert r.status_code == 200
        doc = next(s for s in client.get("/api/v1/configuracao/servicos").json() if s["categoria"] == "documentacao")
        assert doc["fonte"] == fonte and doc["verificado_em"] == "2026-10-01"

        futuro = client.put("/api/v1/configuracao/servicos/documentacao", json={**doc, "verificado_em": "2999-01-01"})
        assert futuro.status_code == 422

        client.post("/api/v1/configuracao/servicos/documentacao/restaurar")
        doc = next(s for s in client.get("/api/v1/configuracao/servicos").json() if s["categoria"] == "documentacao")
        assert doc["fonte"] == "" and doc["verificado_em"] is None


def test_banco_antigo_ganha_colunas_novas(tmp_path):
    import sqlite3
    from sqlalchemy import create_engine, inspect
    from app.db import _adicionar_colunas_novas

    caminho = tmp_path / "antigo.db"
    with sqlite3.connect(caminho) as con:  # tabela como era antes de existir fonte/verificado_em
        con.execute("CREATE TABLE servicos_categoria (categoria VARCHAR(40) PRIMARY KEY, titulo VARCHAR(160), servicos JSON,"
                    " documentos JSON, local_atendimento TEXT, contato_util TEXT, atualizado_em DATETIME, atualizado_por VARCHAR(120))")
    engine = create_engine(f"sqlite:///{caminho}")
    from app.db import Base
    with engine.begin() as conn:
        Base.metadata.create_all(conn)
        _adicionar_colunas_novas(conn)
    colunas = {c["name"] for c in inspect(engine).get_columns("servicos_categoria")}
    assert {"fonte", "verificado_em"} <= colunas


def test_mensagem_de_emergencia_nao_pode_perder_os_numeros():
    with TestClient(app) as client:
        autenticar(client)
        r = client.put("/api/v1/configuracao/textos/emergencia", json={"texto": "Procure ajuda."})
        assert r.status_code == 422
        assert "190" in r.json()["detail"]
        ok = client.put("/api/v1/configuracao/textos/boas_vindas", json={"texto": "Olá! Você concorda? 1 - Sim 2 - Não"})
        assert ok.status_code == 200
        assert _simular(client, "5562922220004", "oi")["respostas"][0].startswith("Olá! Você concorda?")
        textos = {t["chave"]: t for t in client.get("/api/v1/configuracao/textos").json()}
        client.put("/api/v1/configuracao/textos/boas_vindas", json={"texto": textos["boas_vindas"]["padrao"]})


def test_ver_contato_registra_quem_consultou():
    with TestClient(app) as client:
        autenticar(client)
        criada = client.post("/api/v1/triagem/submeter", json={
            "relato": "preciso atualizar meu cadastro unico", "telefone": "5562933334444", "canal": "presencial"}).json()
        r = client.get(f"/api/v1/triagem/{criada['triagem_id']}/contato")
        assert r.json()["telefone"] == "5562933334444"
        triagem = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] == criada["triagem_id"])
        assert triagem["canal"] == "presencial"
        assert "telefone consultado por" in triagem["observacoes"]


def test_indicadores_ignoram_demonstracao():
    with TestClient(app) as client:
        autenticar(client)
        dados = client.get("/api/v1/triagem/indicadores/resumo?dias=7").json()
        assert len(dados["por_dia"]) == 7
        assert "demo" not in dados["por_canal"]
        assert dados["total"] == sum(d["total"] for d in dados["por_dia"])
