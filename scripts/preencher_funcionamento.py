"""
Preenche as faixas de funcionamento ("aberto agora") das unidades que ainda não têm nenhuma:
1. CRAS/CREAS/Centro POP: horário oficial do CadSUAS (data/unidades_anapolis_cadsuas.json), pelo nome;
2. os outros: o texto de horário, quando diz o horário explicitamente ("Seg. a sex., 8h às 17h").
"Horário comercial" e unidades sem horário ficam sem faixa: nada é presumido. Unidade com faixas já
cadastradas no painel não é tocada.

    .venv/Scripts/python scripts/preencher_funcionamento.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
os.chdir(RAIZ / "backend")  # as configurações leem o .env da pasta atual

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.models import UnidadeAtendimento, agora  # noqa: E402
from app.services import funcionamento  # noqa: E402
from app.services.ml.text_rules import normalizar  # noqa: E402

CADSUAS = RAIZ / "data" / "unidades_anapolis_cadsuas.json"
DIA = {"Seg": 0, "Ter": 1, "Qua": 2, "Qui": 3, "Sex": 4, "Sab": 5, "Sáb": 5, "Dom": 6}


def _nome(texto: str) -> str:
    return " ".join(p for p in normalizar(texto).split() if p != "unidade")


def faixas_cadsuas() -> dict:
    """nome normalizado → faixas, para as unidades do CadSUAS que informaram dias e horário."""
    dados = json.loads(CADSUAS.read_text(encoding="utf-8"))
    saida = {}
    for u in dados["unidades"]:
        dias = [DIA[d] for d in u["dias_atendimento"] if d in DIA]
        if dias and u["horario_inicio"] and u["horario_fim"]:
            saida[_nome(u["nome"])] = funcionamento.validar([{"dias": dias, "abre": u["horario_inicio"], "fecha": u["horario_fim"]}])
    return saida


async def main() -> None:
    await init_db()
    oficiais = faixas_cadsuas()
    async with SessionLocal() as s:
        for u in (await s.execute(select(UnidadeAtendimento).order_by(UnidadeAtendimento.nome))).scalars():
            if u.funcionamento:
                print(f"já tem faixas      {u.nome}")
                continue
            faixas, origem = oficiais.get(_nome(u.nome)), "CadSUAS"
            if not faixas:
                faixas, origem = funcionamento.de_texto(u.horario), "texto do horário"
            if not faixas:
                print(f"sem horário claro  {u.nome} ({u.horario or 'vazio'})")
                continue
            u.funcionamento = faixas
            u.atualizado_em, u.atualizado_por = agora(), f"faixas de funcionamento ({origem})"
            print(f"preenchido         {u.nome}: {funcionamento.resumo(faixas)} [{origem}]")
        await s.commit()


if __name__ == "__main__":
    asyncio.run(main())
