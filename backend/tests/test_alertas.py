"""Gestão › Alertas: liga/desliga de cada mensagem automática, tempos do lembrete e do retorno, alerta de fila parada."""
import uuid
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.models import FUSO_LOCAL, Conversa, local
from app.services import agenda, catalogo
from app.services.anonimizacao import hash_telefone
from conftest import autenticar
from test_equipe_cras import _caso, _msgs
from test_unidades import conversa, telefone

OPCOES = "/api/v1/configuracao/fluxo/opcoes"
NOVAS = ("alerta_fila_horas", "aviso_em_atendimento", "aviso_concluido", "pedir_avaliacao", "aviso_agendamento",
         "lembrete_vespera", "lembrete_horas", "retorno_dias")


def _relato() -> str:
    """Relato único: o banco de teste é compartilhado e outros testes procuram casos pelo texto do relato."""
    return f"perdi minha identidade e preciso tirar outra {uuid.uuid4().hex[:6]}"


def _restaurar(client):
    """As opções valem para o banco de teste inteiro: volta tudo ao padrão do sistema."""
    client.put(OPCOES, json={"opcoes": {k: catalogo.OPCOES_PADRAO[k] for k in NOVAS + ("perguntar_depois",)}})


def test_padroes_e_limites_das_opcoes():
    with TestClient(app) as client:
        autenticar(client)
        try:
            opcoes = client.get(OPCOES).json()["opcoes"]
            assert {k: opcoes[k] for k in NOVAS} == {k: catalogo.OPCOES_PADRAO[k] for k in NOVAS}
            for chave, ruins in {"alerta_fila_horas": (-1, 721, True), "lembrete_horas": (1, 73, "20"),
                                 "retorno_dias": (0, 31, 2.5), "aviso_concluido": (1, "sim")}.items():
                for ruim in ruins:
                    r = client.put(OPCOES, json={"opcoes": {chave: ruim}})
                    assert r.status_code == 422, (chave, ruim)
            assert "horas" in client.put(OPCOES, json={"opcoes": {"lembrete_horas": 100}}).json()["detail"]
            assert client.put(OPCOES, json={"opcoes": {"alerta_fila_horas": 0}}).json()["opcoes"]["alerta_fila_horas"] == 0
        finally:
            _restaurar(client)


def test_aviso_de_andamento_e_nota_respeitam_as_chaves():
    with TestClient(app) as client:
        autenticar(client)
        try:
            caso = _caso(client, telefone(), _relato())
            client.put(OPCOES, json={"opcoes": {"aviso_em_atendimento": False}})
            r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "EM_ATENDIMENTO"}).json()
            assert r["aviso"] == {"enviado": False, "motivo": "desligado"}

            client.put(OPCOES, json={"opcoes": {"pedir_avaliacao": False}})
            r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "CONCLUIDO"}).json()
            assert r["aviso"]["enviado"]
            msgs = _msgs(client, caso["conversa_id"])
            assert "foi concluído" in msgs[-1] and not any("de *1* a *5*" in m for m in msgs)  # sem pedido de nota
        finally:
            _restaurar(client)


def test_agendamento_e_lembrete_desligados_e_horas_do_lembrete():
    async def lembrar(momento):
        async with abrir_sessao() as session:
            return await agenda.enviar_lembretes(session, momento)

    with TestClient(app) as client:
        autenticar(client)
        try:
            client.put(OPCOES, json={"opcoes": {"aviso_agendamento": False}})
            caso = _caso(client, telefone(), _relato())
            dia = (local() + timedelta(days=4)).date()
            r = client.post(f"/api/v1/triagem/{caso['id']}/agendamento", json={"quando": f"{dia.isoformat()}T10:00"}).json()
            assert r["aviso"] == {"enviado": False, "motivo": "desligado"} and r["triagem"]["agendado_para"]
            assert not any("foi marcado" in m for m in _msgs(client, caso["conversa_id"]))

            # Lembrete com 6 h de antecedência: 18 h antes ainda é cedo, 5 h antes vai
            client.put(OPCOES, json={"opcoes": {"aviso_agendamento": True, "lembrete_horas": 6}})
            atendimento = datetime(dia.year, dia.month, dia.day, 10, 0, tzinfo=FUSO_LOCAL)
            client.portal.call(lembrar, atendimento - timedelta(hours=18))
            assert not any(m.startswith("🔔 Lembrete") for m in _msgs(client, caso["conversa_id"]))
            client.portal.call(lembrar, atendimento - timedelta(hours=5))
            assert any(m.startswith("🔔 Lembrete") for m in _msgs(client, caso["conversa_id"]))

            # Lembrete desligado: não vai, e o caso fica marcado como resolvido (não tenta de novo)
            client.put(OPCOES, json={"opcoes": {"lembrete_vespera": False, "lembrete_horas": 20}})
            outro = _caso(client, telefone(), _relato())
            client.post(f"/api/v1/triagem/{outro['id']}/agendamento", json={"quando": f"{dia.isoformat()}T10:00"})
            client.portal.call(lembrar, atendimento - timedelta(hours=18))
            assert not any(m.startswith("🔔 Lembrete") for m in _msgs(client, outro["conversa_id"]))
        finally:
            _restaurar(client)


def test_retorno_usa_os_dias_configurados():
    async def acompanhamento(telefone_hash):
        async with abrir_sessao() as session:
            return (await session.get(Conversa, telefone_hash)).acompanhamento

    with TestClient(app) as client:
        autenticar(client)
        try:
            client.put(OPCOES, json={"opcoes": {"retorno_dias": 7}})
            tel = telefone()
            conversa(client, tel, "oi", "1", _relato(), "1", "2")  # 2 = sem contato
            acomp = client.portal.call(acompanhamento, hash_telefone(tel))
            em = datetime.fromisoformat(acomp["em"])
            assert timedelta(days=6, hours=23) < em - local() < timedelta(days=7, hours=1)
        finally:
            _restaurar(client)
