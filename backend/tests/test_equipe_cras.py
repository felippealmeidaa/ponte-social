"""Para a equipe do CRAS: agenda com confirmação e lembrete, respostas prontas e tempo do alerta de urgência."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.models import FUSO_LOCAL, local
from app.services import agenda
from conftest import autenticar
from test_unidades import conversa, telefone

FILA = "/api/v1/triagem/fila"


def _caso(client, tel, relato="perdi minha identidade e preciso tirar outra"):
    antes = {t["id"] for t in client.get(FILA).json()}
    conversa(client, tel, "oi", "1", relato, "1", "1")
    return next(t for t in client.get(FILA).json() if t["id"] not in antes)


def _msgs(client, conversa_id):
    return [m["texto"] for m in client.get(f"/api/v1/atendimento/conversas/{conversa_id}/mensagens").json()["mensagens"]]


def test_marcar_atendimento_confirma_lembra_na_vespera_e_desmarca():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        caso = _caso(client, tel)
        dia = (local() + timedelta(days=3)).date()
        quando = f"{dia.isoformat()}T09:00"  # sem fuso = horário de Brasília
        r = client.post(f"/api/v1/triagem/{caso['id']}/agendamento", json={"quando": quando, "local": "CRAS Centro"}).json()
        assert r["aviso"]["enviado"] and r["triagem"]["agendado_local"] == "CRAS Centro"
        assert local(datetime.fromisoformat(r["triagem"]["agendado_para"])).hour == 9
        assert any("Seu atendimento foi marcado para" in m and "às 9h" in m for m in _msgs(client, caso["conversa_id"]))
        assert "📅 Seu atendimento está marcado" in conversa(client, tel, "meu pedido")[0][0]

        async def lembrar(momento):
            async with abrir_sessao() as session:
                return await agenda.enviar_lembretes(session, momento)
        vespera = datetime(dia.year, dia.month, dia.day, 9, 0, tzinfo=FUSO_LOCAL) - timedelta(hours=18)
        assert client.portal.call(lembrar, vespera - timedelta(days=1)) == 0  # cedo demais
        assert client.portal.call(lembrar, vespera) >= 1
        assert any(m.startswith("🔔 Lembrete") for m in _msgs(client, caso["conversa_id"]))
        client.portal.call(lembrar, vespera + timedelta(hours=1))
        ultimos = _msgs(client, caso["conversa_id"])
        assert sum(m.startswith("🔔 Lembrete") for m in ultimos) == 1  # um lembrete só

        r = client.delete(f"/api/v1/triagem/{caso['id']}/agendamento").json()
        assert r["triagem"]["agendado_para"] is None and r["aviso"]["enviado"]
        assert "foi desmarcado" in _msgs(client, caso["conversa_id"])[-1]

        ontem = (local() - timedelta(days=1)).date().isoformat() + "T09:00"
        assert client.post(f"/api/v1/triagem/{caso['id']}/agendamento", json={"quando": ontem}).status_code == 422


def test_violencia_agenda_sem_mensagem():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in client.get(FILA).json()}
        conversa(client, telefone(), "meu marido me bateu e disse que vai me matar")
        caso = next(t for t in client.get(FILA).json() if t["id"] not in antes)
        quando = (local() + timedelta(days=2)).date().isoformat() + "T10:30"
        r = client.post(f"/api/v1/triagem/{caso['id']}/agendamento", json={"quando": quando}).json()
        assert r["aviso"] == {"enviado": False, "motivo": "violencia"} and r["triagem"]["agendado_para"]


def test_respostas_prontas():
    with TestClient(app) as client:
        autenticar(client)
        lista = client.get("/api/v1/atendimento/respostas-prontas").json()
        assert len(lista) >= 5 and any(r["titulo"] == "Pode vir ao CRAS" for r in lista)
        nova = client.post("/api/v1/atendimento/respostas-prontas", json={"titulo": "Teste", "texto": "Mensagem de teste"}).json()
        assert nova["da_secretaria"]
        r = client.put(f"/api/v1/atendimento/respostas-prontas/{nova['id']}", json={"titulo": "Teste 2", "texto": "Outra"}).json()
        assert r["titulo"] == "Teste 2"
        assert client.post("/api/v1/atendimento/respostas-prontas", json={"titulo": "x", "texto": ""}).status_code == 422
        assert client.delete(f"/api/v1/atendimento/respostas-prontas/{nova['id']}").json()["ok"]
        assert all(r["id"] != nova["id"] for r in client.get("/api/v1/atendimento/respostas-prontas").json())


def test_tempo_do_alerta_configuravel():
    with TestClient(app) as client:
        autenticar(client)
        url = "/api/v1/configuracao/fluxo/opcoes"
        assert client.get(url).json()["opcoes"]["alerta_urgente_min"] == 10
        assert client.put(url, json={"opcoes": {"alerta_urgente_min": 15}}).json()["opcoes"]["alerta_urgente_min"] == 15
        for ruim in (0, 500, True, "10"):
            assert client.put(url, json={"opcoes": {"alerta_urgente_min": ruim}}).status_code == 422, ruim
        client.put(url, json={"opcoes": {"alerta_urgente_min": 10}})


def test_confirmacao_leva_link_para_salvar_na_agenda(monkeypatch):
    from urllib.parse import parse_qs, urlparse
    from app.services import agenda as servico_agenda
    monkeypatch.setattr(servico_agenda.settings, "PUBLICO_URL", "https://ponte.exemplo/api/v1")
    with TestClient(app) as client:
        autenticar(client)
        caso = _caso(client, telefone())
        dia = (local() + timedelta(days=4)).date()
        client.post(f"/api/v1/triagem/{caso['id']}/agendamento", json={"quando": f"{dia.isoformat()}T14:00", "local": "CRAS Norte"})
        ultima = _msgs(client, caso["conversa_id"])[-1]
        assert ultima.startswith("📲 Quer salvar na agenda do celular?")
        google = next(p for p in ultima.split() if p.startswith("https://calendar.google.com"))
        q = parse_qs(urlparse(google).query)
        assert q["action"] == ["TEMPLATE"] and q["location"] == ["CRAS Norte"]
        assert q["dates"] == [f"{dia:%Y%m%d}T170000Z/{dia:%Y%m%d}T180000Z"]  # 14h em Brasília = 17h UTC, 1 hora
        assert "Leve os documentos originais" in q["details"][0]

        ics = next(p for p in ultima.split() if p.endswith(".ics"))
        caminho = ics.replace("https://ponte.exemplo", "")
        r = client.get(caminho)  # sem login: protegido pelo código do link
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
        assert f"DTSTART:{dia:%Y%m%d}T170000Z" in r.text and "LOCATION:CRAS Norte" in r.text and "BEGIN:VALARM" in r.text
        assert client.get(caminho.replace(caminho.split("/")[-1], "codigoerrado.ics")).status_code == 404
