"""Caminho principal: mensagem do cidadão → fluxo do bot → modelo → banco → fila do painel."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.anonimizacao import anonimizar_texto


def _conversa(client, telefone, *mensagens):
    respostas = []
    for texto in mensagens:
        r = client.post("/api/v1/webhooks/simular", json={"telefone": telefone, "texto": texto})
        assert r.status_code == 200
        respostas.append(r.json()["respostas"])
    return respostas


def _fila(client):
    return client.get("/api/v1/triagem/fila").json()


def test_fluxo_completo_entra_na_fila_com_dados_protegidos():
    with TestClient(app) as client:
        antes = {t["id"] for t in _fila(client)}
        r = _conversa(
            client, "5562911110001",
            "oi",
            "1",
            "nao temos nada para comer em casa e meus filhos estao com fome, me liga no 62 99999-1234",
            "1",
            "1",
        )
        assert "concorda" in r[0][0]
        assert "Conte" in r[1][0] or "conte" in r[1][0]
        assert "alimentação" in r[2][0]
        assert "Documentos para levar" in r[3][0]
        assert "enviada para a equipe do CRAS" in r[4][0]

        novas = [t for t in _fila(client) if t["id"] not in antes]
        assert len(novas) == 1
        nova = novas[0]
        assert nova["canal"] == "whatsapp"
        assert nova["categoria"] == "alimentacao"
        assert nova["categoria_confirmada_pelo_cidadao"] is True
        assert "99999-1234" not in nova["relato_original"]
        assert "[telefone]" in nova["relato_original"]
        assert nova["telefone_mascarado"] == "62 9****-0001"


def test_correcao_pelo_cidadao_vira_exemplo_rotulado():
    with TestClient(app) as client:
        _conversa(client, "5562911110002", "ola", "sim", "preciso de ajuda com o cadastro unico da minha familia", "2")
        # menu: 1 renda, 2 cadastro, 3 moradia, 4 documentação ...
        r = _conversa(client, "5562911110002", "4", "1")
        assert "Documentos para levar" in r[0][0]
        exemplos = client.get("/api/v1/triagem/exemplos-rotulados").json()
        assert any(e["categoria"] == "documentacao" and not e["modelo_acertou"] for e in exemplos)


def test_violencia_interrompe_em_qualquer_etapa():
    with TestClient(app) as client:
        antes = {t["id"] for t in _fila(client)}
        r = _conversa(client, "5562911110003", "meu marido me agrediu e estou com medo")
        assert "190" in r[0][0] and "180" in r[0][0]
        urgente = next(t for t in _fila(client) if t["id"] not in antes)
        assert urgente["prioridade"] == "URGENTE_VIOLENCIA"
        assert urgente["status"] == "URGENTE_CREAS"


def test_fila_vem_com_urgentes_primeiro():
    with TestClient(app) as client:
        ordem = {"URGENTE_VIOLENCIA": 0, "ALTA": 1, "MEDIA": 2}
        prioridades = [ordem.get(t["prioridade"], 3) for t in _fila(client)]
        assert prioridades == sorted(prioridades)


def test_sem_consentimento_nao_grava_nada():
    with TestClient(app) as client:
        antes = len(_fila(client))
        r = _conversa(client, "5562911110004", "oi", "2")
        assert "121" in r[1][0]
        assert len(_fila(client)) == antes


def test_relato_curto_pede_mais_detalhes_uma_vez():
    with TestClient(app) as client:
        r = _conversa(client, "5562911110005", "oi", "1", "ajuda")
        assert "um pouco mais" in r[2][0]


def test_mudar_status_no_painel():
    with TestClient(app) as client:
        alvo = _fila(client)[0]["id"]
        r = client.patch(f"/api/v1/triagem/{alvo}/status", json={"status": "EM_ATENDIMENTO"})
        assert r.status_code == 200
        assert next(t for t in _fila(client) if t["id"] == alvo)["status"] == "EM_ATENDIMENTO"
        assert client.patch(f"/api/v1/triagem/{alvo}/status", json={"status": "QUALQUER"}).status_code == 422


def test_webhook_ignora_grupos_e_proprio_bot():
    with TestClient(app) as client:
        base = {"event": "messages.upsert", "data": {"message": {"conversation": "oi"}}}
        grupo = {**base, "data": {**base["data"], "key": {"remoteJid": "123@g.us", "fromMe": False}}}
        proprio = {**base, "data": {**base["data"], "key": {"remoteJid": "5562@s.whatsapp.net", "fromMe": True}}}
        assert client.post("/api/v1/webhooks/evolution", json=grupo).json()["status"] == "ignored"
        assert client.post("/api/v1/webhooks/evolution", json=proprio).json()["status"] == "ignored"


def test_anonimizacao():
    texto = anonimizar_texto("me liga no (62) 99999-1234 ou manda email pra maria@gmail.com, cpf 12345678901")
    assert "99999" not in texto and "maria@" not in texto and "12345678901" not in texto
