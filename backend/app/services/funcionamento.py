"""
"Aberto agora": faixas de funcionamento de cada lugar da rede e a situação num momento dado.

Uma faixa é {"dias": [0..6], "abre": "08:00", "fecha": "17:00"}, com 0 = segunda (datetime.weekday). Um lugar pode
ter mais de uma (ex.: restaurante popular só no almoço, CRAS com horário diferente no sábado). Sem faixas, o lugar
não diz "aberto" nem "fechado": fica só o texto livre do horário.

Horário de Brasília. Feriado nacional (Lei 662/1949, Lei 6.802/1980 e Lei 14.759/2023) e os "dias sem atendimento"
cadastrados pela coordenação (feriado municipal, ponto facultativo, recesso) contam como fechado o dia todo.
"""
import re
from datetime import date, datetime, time, timedelta
from typing import List, Optional

from app.models import local

DIAS_CURTOS = ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."]
DIAS_NOME = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
MAX_FAIXAS = 6
# Feriados nacionais de data fixa: Lei 662/1949 (redação da Lei 10.607/2002), Lei 6.802/1980 (12/10) e
# Lei 14.759/2023 (20/11). Sexta-feira Santa, Carnaval e Corpus Christi não são nacionais: entram como dia sem
# atendimento, quando a prefeitura decretar.
FERIADOS_NACIONAIS = {(1, 1): "Confraternização Universal", (4, 21): "Tiradentes", (5, 1): "Dia do Trabalho",
                      (9, 7): "Independência", (10, 12): "Nossa Senhora Aparecida", (11, 2): "Finados",
                      (11, 15): "Proclamação da República", (11, 20): "Dia de Zumbi e da Consciência Negra",
                      (12, 25): "Natal"}
_HORA = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class FuncionamentoInvalido(ValueError):
    pass


def _hora(texto: str) -> time:
    m = _HORA.match(texto or "")
    if not m:
        raise FuncionamentoInvalido("Use horas no formato 08:00.")
    return time(int(m.group(1)), int(m.group(2)))


def validar(faixas: Optional[list]) -> Optional[List[dict]]:
    """Devolve as faixas limpas (dias em ordem, sem repetição) ou None se não houver nenhuma."""
    if not faixas:
        return None
    if len(faixas) > MAX_FAIXAS:
        raise FuncionamentoInvalido(f"Use no máximo {MAX_FAIXAS} faixas de horário.")
    saida = []
    for f in faixas:
        dias = sorted({int(d) for d in (f.get("dias") or []) if isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6})
        if not dias:
            raise FuncionamentoInvalido("Cada faixa precisa de pelo menos um dia da semana.")
        abre, fecha = _hora(f.get("abre", "")), _hora(f.get("fecha", ""))
        if abre >= fecha:
            raise FuncionamentoInvalido("O horário de abrir precisa ser antes do de fechar.")
        saida.append({"dias": dias, "abre": abre.strftime("%H:%M"), "fecha": fecha.strftime("%H:%M")})
    return saida


def _hora_falada(t: str) -> str:
    h, m = t.split(":")
    return f"{int(h)}h" if m == "00" else f"{int(h)}h{m}"


def _dias_texto(dias: List[int]) -> str:
    """[0,1,2,3,4] → 'seg. a sex.'; [0,2,4] → 'seg., qua. e sex.'"""
    if len(dias) > 2 and dias == list(range(dias[0], dias[-1] + 1)):
        return f"{DIAS_CURTOS[dias[0]]} a {DIAS_CURTOS[dias[-1]]}"
    nomes = [DIAS_CURTOS[d] for d in dias]
    return nomes[0] if len(nomes) == 1 else ", ".join(nomes[:-1]) + " e " + nomes[-1]


def resumo(faixas: Optional[List[dict]]) -> str:
    """'Seg. a sex., 8h às 17h; sáb., 8h às 12h'."""
    partes = [f"{_dias_texto(f['dias'])}, {_hora_falada(f['abre'])} às {_hora_falada(f['fecha'])}" for f in faixas or []]
    texto = "; ".join(partes)
    return texto[:1].upper() + texto[1:]


def dias_sem_atendimento() -> List[dict]:
    """Feriados municipais, pontos facultativos e recessos cadastrados (Gestão › Unidades)."""
    from app.services import catalogo  # evita import circular na carga do app
    return list(catalogo.opcoes_fluxo(None).get("dias_sem_atendimento") or [])


def feriado(dia: date) -> Optional[str]:
    """Nome do feriado ou do dia sem atendimento, ou None se é dia normal."""
    if (dia.month, dia.day) in FERIADOS_NACIONAIS:
        return FERIADOS_NACIONAIS[(dia.month, dia.day)]
    iso = dia.isoformat()
    return next((d.get("nome") or "dia sem atendimento" for d in dias_sem_atendimento() if d.get("data") == iso), None)


def _aberturas(faixas: List[dict], inicio: datetime, dias: int = 15):
    """(abre, fecha) de cada faixa, em ordem, de hoje até 'dias' à frente, pulando feriados."""
    hoje = inicio.date()
    saida = []
    for n in range(dias):
        dia = hoje + timedelta(days=n)
        if feriado(dia):
            continue
        for f in faixas:
            if dia.weekday() in f["dias"]:
                abre = datetime.combine(dia, _hora(f["abre"]), tzinfo=inicio.tzinfo)
                fecha = datetime.combine(dia, _hora(f["fecha"]), tzinfo=inicio.tzinfo)
                saida.append((abre, fecha))
    return sorted(saida)


def _quando(abre: datetime, agora: datetime) -> str:
    if abre.date() == agora.date():
        return f"hoje às {_hora_falada(abre.strftime('%H:%M'))}"
    if abre.date() == agora.date() + timedelta(days=1):
        return f"amanhã às {_hora_falada(abre.strftime('%H:%M'))}"
    return f"{DIAS_NOME[abre.weekday()]} às {_hora_falada(abre.strftime('%H:%M'))}"


def situacao(faixas: Optional[List[dict]], momento: Optional[datetime] = None) -> Optional[dict]:
    """{"aberto": bool, "texto": "Aberto agora, fecha às 17h"} ou None se o lugar não tem faixas."""
    if not faixas:
        return None
    agora = local(momento)
    janelas = _aberturas(faixas, agora)
    for abre, fecha in janelas:
        if abre <= agora < fecha:
            # Faixas coladas (ex.: 8–12 e 12–17) contam como uma só
            fim = fecha
            for a2, f2 in janelas:
                if a2 <= fim < f2:
                    fim = f2
            return {"aberto": True, "texto": f"Aberto agora, fecha às {_hora_falada(fim.strftime('%H:%M'))}"}
    proxima = next((abre for abre, _ in janelas if abre > agora), None)
    hoje = feriado(agora.date())
    fechado = f"Fechado hoje ({hoje})" if hoje else "Fechado agora"
    if proxima is None:
        return {"aberto": False, "texto": fechado}
    return {"aberto": False, "texto": f"{fechado}, abre {_quando(proxima, agora)}"}


_DIA_TEXTO = {"seg": 0, "ter": 1, "qua": 2, "qui": 3, "sex": 4, "sab": 5, "sáb": 5, "dom": 6}
_FAIXA_TEXTO = re.compile(
    r"(seg|ter|qua|qui|sex|s[aá]b|dom)\w*\.?\s*(?:a|à)\s*(seg|ter|qua|qui|sex|s[aá]b|dom)\w*\.?,?\s*"
    r"(\d{1,2})h(\d{2})?\s*(?:às|as|a|-|–)\s*(\d{1,2})h(\d{2})?", re.I)


def de_texto(texto: str) -> Optional[List[dict]]:
    """Lê faixas escritas como 'Seg. a sex., 8h às 17h' (uma ou mais, separadas por ';').
    Texto sem horário explícito ('horário comercial') devolve None: nada é presumido."""
    faixas = []
    for m in _FAIXA_TEXTO.finditer(texto or ""):
        d1, d2 = _DIA_TEXTO[m.group(1).lower()[:3]], _DIA_TEXTO[m.group(2).lower()[:3]]
        if d2 < d1:
            continue
        abre = f"{int(m.group(3)):02d}:{m.group(4) or '00'}"
        fecha = f"{int(m.group(5)):02d}:{m.group(6) or '00'}"
        faixas.append({"dias": list(range(d1, d2 + 1)), "abre": abre, "fecha": fecha})
    try:
        return validar(faixas)
    except FuncionamentoInvalido:
        return None


_SO_HORARIO = re.compile(r"(seg|ter|qua|qui|sex|s[aá]b|dom)\w*\.?|\b(a|à|às|as|e)\b|hor[aá]rio comercial|\d{1,2}h\d{0,2}|[.,;:–-]", re.I)


def texto_horario(texto: str, faixas: Optional[List[dict]]) -> str:
    """Horário para mostrar: com faixas, o resumo delas mais o que o texto livre tiver além de dia e hora
    ('Almoço a R$ 2'); sem faixas, o texto livre como está."""
    if not faixas:
        return texto or ""
    resto = _FAIXA_TEXTO.sub("", texto or "")
    sobra = _SO_HORARIO.sub(" ", resto)
    extra = resto.strip(" .,;") if len(re.sub(r"\W", "", sobra)) >= 3 else ""
    return resumo(faixas) + (f". {extra}" if extra else "")
