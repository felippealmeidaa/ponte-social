"""Relatório mensal: mês no horário de Brasília, comparação com o mês anterior, acerto da IA e planilha."""
import io
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.db import abrir_sessao
from app.main import app
from app.models import Triagem
from conftest import autenticar

MES = "2025-03"  # mês sem nenhum outro caso de teste


def _caso(criado_em, categoria, modelo=None, **extra):
    return Triagem(id=uuid.uuid4().hex[:16], criado_em=criado_em, canal=extra.pop("canal", "whatsapp"), relato_anonimizado="r",
                   categoria=categoria, categoria_modelo=modelo or categoria, titulo_encaminhamento="t",
                   prioridade="URGENTE_VIOLENCIA" if categoria == "violencia_protecao" else "MEDIA", metodo_decisao="teste", **extra)


def test_relatorio_do_mes_e_planilha():
    utc = timezone.utc
    casos = [
        _caso(datetime(2025, 3, 10, 15, tzinfo=utc), "alimentacao", bairro="Vila Jaiara", status="CONCLUIDO", avaliacao=5,
              atendido_em=datetime(2025, 3, 10, 17, tzinfo=utc)),
        _caso(datetime(2025, 3, 11, 15, tzinfo=utc), "alimentacao", bairro="Vila Jaiara", categoria_confirmada_pelo_cidadao=True),
        _caso(datetime(2025, 3, 12, 15, tzinfo=utc), "violencia_protecao", "moradia", bairro="Centro", corrigida_por="ana"),
        # 22h de 31/03 em Brasília = 01h de 01/04 em UTC: conta em março
        _caso(datetime(2025, 4, 1, 1, tzinfo=utc), "documentacao"),
        # 00h30 de 01/03 em UTC = 21h30 de 28/02 em Brasília: conta em fevereiro
        _caso(datetime(2025, 3, 1, 0, 30, tzinfo=utc), "moradia"),
        _caso(datetime(2025, 3, 15, tzinfo=utc), "moradia", canal="demo"),
    ]

    async def gravar():
        async with abrir_sessao() as session:
            session.add_all(casos)
            await session.commit()

    with TestClient(app) as client:
        autenticar(client)
        client.portal.call(gravar)
        dados = client.get(f"/api/v1/triagem/relatorio?mes={MES}").json()
        r = client.get(f"/api/v1/triagem/relatorio.xlsx?mes={MES}")
        assert client.get("/api/v1/triagem/relatorio?mes=2025-13").status_code == 422

    assert dados["titulo"] == "março de 2025"
    assert dados["resumo"]["casos"] == 4 and dados["resumo"]["mes_anterior"] == 1 and dados["resumo"]["urgentes"] == 1
    assert dados["por_categoria"][0] == {"categoria": "alimentacao", "nome": "Alimentação", "casos": 2, "mes_anterior": 0,
                                         "concluidos": 1, "mediana_resposta_min": 120}
    assert dados["por_bairro"][0]["bairro"] == "Vila Jaiara" and dados["por_bairro"][0]["principal"] == "Alimentação"
    assert dados["notas"]["media"] == 5.0
    ia = dados["acerto_ia"]
    assert ia["iguais_a_sugestao"] == 3 and ia["corrigidas_pela_equipe"] == 1 and ia["violencia_nao_percebida"] == 1
    assert ia["trocas_mais_comuns"] == [{"de": "Moradia", "para": "Violência ou ameaça", "casos": 1}]

    assert r.status_code == 200 and 'filename="relatorio-2025-03.xlsx"' in r.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["Resumo", "Necessidades", "Bairros", "Tempo de resposta", "Notas", "Acerto da IA"]
    assert [c.value for c in wb["Necessidades"][4]][:3] == ["Alimentação", 2, 0]
