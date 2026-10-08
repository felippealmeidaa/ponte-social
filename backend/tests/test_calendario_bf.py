"""Calendário do Bolsa Família: o bot responde a data pelo final do NIS, sem confundir com relato de problema."""
from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services import calendario_bf as cal
from app.services.ml.text_rules import normalizar
from conftest import autenticar
from test_unidades import conversa, telefone


def test_pergunta_de_data_x_relato_de_problema():
    assert cal.e_pergunta(normalizar("quando cai meu bolsa família?"))
    assert cal.e_pergunta(normalizar("qual o calendario do bolsa"))
    assert not cal.e_pergunta(normalizar("meu bolsa familia nao caiu esse mes"))  # problema: segue como relato
    assert not cal.e_pergunta(normalizar("foi bloqueado meu bolsa familia, quando vai cair?"))
    assert not cal.e_pergunta(normalizar("quando abre o cras"))
    assert cal.final_do_nis(normalizar("meu nis termina em 7")) == "7"
    assert cal.final_do_nis(normalizar("meu nis é 12345678904")) == "4"


def test_datas_do_calendario_oficial():
    assert cal.data_pagamento("7", 2026, 10) == date(2026, 10, 27)
    assert cal.data_pagamento("0", 2026, 12) == date(2026, 12, 23)
    r = cal.resposta(normalizar("quando cai o bolsa final 7"), hoje=date(2026, 10, 8))[0]
    assert "terça-feira, 27/10" in r
    # Final 1 já recebeu em outubro (19/10): mostra novembro também
    r = cal.resposta(normalizar("quando cai o bolsa final 1"), hoje=date(2026, 10, 25))[0]
    assert "caiu" in r and "16/11" in r
    # Sem final: as datas do mês para todos; depois do último dia do mês, o mês seguinte
    assert "Final 0: 30/11" in cal.resposta(normalizar("quando cai o bolsa"), hoje=date(2026, 10, 31))[0]
    # Sem o calendário do ano, não inventa data
    assert "Ainda não tenho" in cal.resposta(normalizar("quando cai o bolsa"), hoje=date(2026, 12, 28))[0]


def test_bot_responde_e_continua_na_mesma_etapa():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "oi", "1")  # aceitou: o bot pede o relato
        r = conversa(client, tel, "quando cai meu bolsa familia? meu nis termina em 3")[0]
        assert r[0].startswith("📅 NIS com final *3*")
        # Continua esperando o relato: o próximo texto vira caso normalmente
        r = conversa(client, tel, "perdi minha identidade e preciso tirar outra via")[0]
        assert not any(m.startswith("📅") for m in r) and len(r) >= 1
