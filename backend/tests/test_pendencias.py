"""Relato contado na pergunta do local não se perde; dias dos indicadores no horário de Brasília."""
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.models import Triagem, local
from conftest import autenticar
from test_unidades import conversa, cras_teste, telefone, unidades


def test_relato_na_pergunta_do_local_segue_como_relato():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()):
            r = conversa(client, telefone(), "oi", "1", "nao temos nada para comer em casa e meus filhos estao com fome")
            assert "onde mora" in r[1][0]
            assert "Não encontrei esse bairro" not in r[2][0]
            assert "Está certo?" in r[2][0] and "alimentação" in r[2][0]
            # bairro de verdade continua sendo bairro, e nome que não é relato nem bairro conhecido também
            r = conversa(client, telefone(), "oi", "1", "vila jaiara")
            assert "CRAS Teste Norte" in r[2][0]
            r = conversa(client, telefone(), "oi", "1", "Jardim das Flores")
            assert "Não encontrei esse bairro" in r[2][0]


def test_dia_dos_indicadores_no_horario_de_brasilia():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
        conversa(client, telefone(), "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "1")
        caso = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)
        hoje = local().date()
        # 22h30 de ontem em Brasília = 01h30 de hoje em UTC: deve contar em "ontem"
        ontem_22h30_utc = datetime(hoje.year, hoje.month, hoje.day, 1, 30, tzinfo=timezone.utc)

        async def mudar():
            async with abrir_sessao() as session:
                (await session.get(Triagem, caso["id"])).criado_em = ontem_22h30_utc
                await session.commit()
        client.portal.call(mudar)
        dias = client.get("/api/v1/triagem/indicadores/resumo?dias=7").json()["por_dia"]
        assert dias[-1]["dia"] == hoje.isoformat()
        ontem = local(ontem_22h30_utc).date().isoformat()
        assert ontem != hoje.isoformat() and any(d["dia"] == ontem and d["total"] >= 1 for d in dias)
