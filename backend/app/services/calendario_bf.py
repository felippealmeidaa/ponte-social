"""
Calendário de pagamento do Bolsa Família: "quando cai meu bolsa família?" no WhatsApp.

As datas vêm do calendário oficial (data/calendario_bolsa_familia_<ano>.json, tirado da página de pagamentos do
MDS). O dia depende do último número do NIS. Se a pessoa disser o final ("termina em 7"), o bot responde a data dela;
se não, manda as datas do mês para todos os finais (sem guardar estado nem pedir o NIS).

Só responde pergunta de data. "Meu bolsa família não caiu" ou "foi bloqueado" é um problema: segue como relato.
"""
import json
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from app.models import local

PASTA = Path(__file__).resolve().parents[3] / "data"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
         "novembro", "dezembro"]
DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
FINAIS = "1234567890"

# Texto já normalizado (sem acento, minúsculo)
_BOLSA = re.compile(r"\b(bolsa\s*familia|bolsa|bf|pbf)\b")
_DATA = re.compile(r"\b(quando|que dia|qual dia|qual (a )?data|data|dia do pagamento|calendario|cai|caira|vai cair|recebo|"
                   r"vou receber|paga|pagam|sai|deposita|libera)\b")
_PROBLEMA = re.compile(r"\b(nao (caiu|recebi|veio|entrou|saiu|depositou)|bloque|cortad|cancelad|suspens|cortaram|parou|"
                       r"atrasad|sumiu|diminuiu|reduziu)")
_FINAL = re.compile(r"(?:final|termina(?:do)? (?:em|com)|terminacao|ultimo (?:numero|digito)(?: do nis)?(?: e)?|nis)\D{0,12}(\d{1,11})\b")


@lru_cache(maxsize=4)
def _calendario(ano: int) -> Optional[dict]:
    arquivo = PASTA / f"calendario_bolsa_familia_{ano}.json"
    return json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else None


def data_pagamento(final: str, ano: int, mes: int) -> Optional[date]:
    cal = _calendario(ano)
    if not cal or final not in cal["por_final_do_nis"]:
        return None
    return date(ano, mes, cal["por_final_do_nis"][final][mes - 1])


def datas_do_mes(ano: int, mes: int) -> Optional[Dict[str, date]]:
    cal = _calendario(ano)
    if not cal:
        return None
    return {f: date(ano, mes, cal["por_final_do_nis"][f][mes - 1]) for f in FINAIS}


def e_pergunta(texto_norm: str) -> bool:
    """Pergunta de data de pagamento do Bolsa Família (e não relato de problema com o benefício)."""
    return bool(_BOLSA.search(texto_norm) and _DATA.search(texto_norm) and not _PROBLEMA.search(texto_norm))


def final_do_nis(texto_norm: str) -> Optional[str]:
    """'meu nis termina em 7' → '7'; o NIS inteiro digitado → o último número dele."""
    m = _FINAL.search(texto_norm)
    return m.group(1)[-1] if m else None


def _mes_de_referencia(hoje: date) -> tuple:
    """O mês atual; se o último pagamento do mês já passou, o próximo."""
    datas = datas_do_mes(hoje.year, hoje.month)
    if datas and max(datas.values()) < hoje:
        return (hoje.year + 1, 1) if hoje.month == 12 else (hoje.year, hoje.month + 1)
    return hoje.year, hoje.month


def _dia(d: date) -> str:
    return f"{DIAS_SEMANA[d.weekday()]}, {d:%d/%m}"


def resposta(texto_norm: str, hoje: Optional[date] = None) -> List[str]:
    hoje = hoje or local().date()
    ano, mes = _mes_de_referencia(hoje)
    datas = datas_do_mes(ano, mes)
    if not datas:
        return [f"Ainda não tenho o calendário do Bolsa Família de {ano}. Consulte no aplicativo *Bolsa Família* "
                "ou no *Caixa Tem*, ou pergunte no CRAS."]
    rodape = ("O dia depende do *último número do NIS*, que está no cartão do Bolsa Família. O dinheiro cai na conta "
              "da Caixa (dá para ver no *Caixa Tem*). Se o pagamento não cair, me conte o que aconteceu que eu te oriento.")
    final = final_do_nis(texto_norm)
    if final:
        d = datas[final]
        if d < hoje:  # o do mês já passou para este final: mostra o próximo
            prox_ano, prox_mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
            prox = data_pagamento(final, prox_ano, prox_mes)
            seguinte = f" O de {MESES[prox_mes - 1]} cai na *{_dia(prox)}*." if prox else ""
            return [f"📅 NIS com final *{final}*: o Bolsa Família de {MESES[mes - 1]} caiu na {_dia(d)}.{seguinte}\n\n{rodape}"]
        quando = "*hoje*" if d == hoje else f"na *{_dia(d)}*"
        return [f"📅 NIS com final *{final}*: o Bolsa Família de {MESES[mes - 1]} cai {quando}.\n\n{rodape}"]
    linhas = [f"Final {f}: {datas[f]:%d/%m}" for f in FINAIS]
    return [f"📅 *Bolsa Família de {MESES[mes - 1]} de {ano}*\n" + "\n".join(linhas) + f"\n\n{rodape}"]
