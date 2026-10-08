"""'Aberto agora': faixas de funcionamento das unidades, a situação num momento e o texto que o bot manda."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import FUSO_LOCAL, UnidadeAtendimento
from app.services import funcionamento as f
from app.services import unidades as servico
from conftest import autenticar
from test_unidades import cras_teste, unidades

SEG_SEX = [{"dias": [0, 1, 2, 3, 4], "abre": "08:00", "fecha": "17:00"}]


def _em(dia, hora, minuto=0):
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO_LOCAL)  # 05/10/2026 é segunda-feira


@pytest.mark.parametrize("momento, esperado", [
    (_em(8, 10), "Aberto agora, fecha às 17h"),           # quinta de manhã
    (_em(8, 7, 30), "Fechado agora, abre hoje às 8h"),
    (_em(8, 17), "Fechado agora, abre amanhã às 8h"),     # fecha às 17h em ponto
    (_em(9, 18), "Fechado agora, abre terça às 8h"),      # sexta à noite (segunda, 12/10, é feriado nacional)
    (_em(10, 9), "Fechado agora, abre terça às 8h"),      # sábado
    (_em(16, 18), "Fechado agora, abre segunda às 8h"),   # sexta seguinte, sem feriado
])
def test_situacao_por_horario(momento, esperado):
    assert f.situacao(SEG_SEX, momento)["texto"] == esperado
    assert f.situacao(SEG_SEX, momento)["aberto"] == esperado.startswith("Aberto")


def test_faixas_emendadas_e_sem_faixas():
    dupla = [{"dias": [0, 1, 2, 3, 4], "abre": "08:00", "fecha": "12:00"},
             {"dias": [0, 1, 2, 3, 4], "abre": "12:00", "fecha": "17:00"}]
    assert f.situacao(dupla, _em(8, 11))["texto"] == "Aberto agora, fecha às 17h"
    assert f.situacao(None) is None and f.situacao([]) is None


def test_validar_resumo_e_texto():
    assert f.validar([{"dias": [4, 0, 0], "abre": "07:30", "fecha": "11:00"}]) == [{"dias": [0, 4], "abre": "07:30", "fecha": "11:00"}]
    assert f.resumo(SEG_SEX) == "Seg. a sex., 8h às 17h"
    for ruim in ([{"dias": [], "abre": "08:00", "fecha": "17:00"}], [{"dias": [1], "abre": "18:00", "fecha": "17:00"}],
                 [{"dias": [1], "abre": "8h", "fecha": "17:00"}], [{"dias": [9], "abre": "08:00", "fecha": "17:00"}]):
        with pytest.raises(f.FuncionamentoInvalido):
            f.validar(ruim)
    # Do texto livre, só horário explícito; "horário comercial" não vira faixa
    assert f.de_texto("Seg. a sex., 11h às 13h. Almoço a R$ 2") == [{"dias": [0, 1, 2, 3, 4], "abre": "11:00", "fecha": "13:00"}]
    assert f.de_texto("Seg. a sex., horário comercial") is None
    # Com faixas, o texto mostrado é o das faixas, mais o que o texto livre tiver além de dia e hora
    assert f.texto_horario("Seg. a sex., horário comercial", SEG_SEX) == "Seg. a sex., 8h às 17h"
    assert f.texto_horario("Seg. a sex., 11h às 13h. Almoço a R$ 2", f.de_texto("Seg. a sex., 11h às 13h")).endswith("Almoço a R$ 2")


def test_bot_mostra_aberto_ou_fechado(monkeypatch):
    u = UnidadeAtendimento(nome="CRAS X", tipo="CRAS", endereco="Rua A, 1", horario="", telefone="", funcionamento=SEG_SEX)
    monkeypatch.setattr(f, "local", lambda momento=None: _em(8, 10))
    assert "🟢 Aberto agora, fecha às 17h" in servico.descricao(u)
    monkeypatch.setattr(f, "local", lambda momento=None: _em(8, 20))
    assert "🔴 Fechado agora, abre amanhã às 8h" in servico.descricao(u)
    u.funcionamento = None
    assert "Aberto" not in servico.descricao(u) and "Fechado" not in servico.descricao(u)


def test_cadastro_com_faixas_pela_api():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste(funcionamento=SEG_SEX)) as (cras,):
            assert cras["funcionamento"] == SEG_SEX and cras["situacao"]["texto"]
        r = client.post("/api/v1/configuracao/unidades", json=cras_teste(funcionamento=[{"dias": [1], "abre": "18:00", "fecha": "08:00"}]))
        assert r.status_code == 422 and "antes" in r.json()["detail"]


def test_feriado_nacional_e_dia_sem_atendimento(monkeypatch):
    # 12/10/2026 é segunda e feriado nacional (N. Sra. Aparecida): fechado o dia todo, abre terça
    assert f.situacao(SEG_SEX, _em(12, 10))["texto"] == "Fechado hoje (Nossa Senhora Aparecida), abre amanhã às 8h"
    # Sexta antes do feriado, à noite: pula o feriado de segunda
    assert f.situacao(SEG_SEX, _em(9, 18))["texto"] == "Fechado agora, abre terça às 8h"
    assert f.feriado(datetime(2026, 11, 20).date()) == "Dia de Zumbi e da Consciência Negra"
    # Dia sem atendimento cadastrado pela coordenação (ex.: ponto facultativo)
    monkeypatch.setattr(f, "dias_sem_atendimento", lambda: [{"data": "2026-10-08", "nome": "Ponto facultativo"}])
    assert f.situacao(SEG_SEX, _em(8, 10))["texto"] == "Fechado hoje (Ponto facultativo), abre amanhã às 8h"


def test_dias_sem_atendimento_pela_api():
    from app.services import catalogo
    url = "/api/v1/configuracao/fluxo/opcoes"
    with TestClient(app) as client:
        autenticar(client)
        try:
            dias = [{"data": "2026-12-24", "nome": "Ponto facultativo"}]
            assert client.put(url, json={"opcoes": {"dias_sem_atendimento": dias}}).json()["opcoes"]["dias_sem_atendimento"] == dias
            assert f.feriado(datetime(2026, 12, 24).date()) == "Ponto facultativo"
            assert client.put(url, json={"opcoes": {"dias_sem_atendimento": [{"data": "24/12", "nome": "x"}]}}).status_code == 422
            assert catalogo.validar_opcoes({"dias_sem_atendimento": []}, "uni-x") is not None  # só a secretaria
        finally:
            client.put(url, json={"opcoes": {"dias_sem_atendimento": []}})
