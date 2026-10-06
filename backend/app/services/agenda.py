"""
Atendimento marcado: a equipe escolhe dia e hora na ficha, a pessoa recebe a confirmação pelo WhatsApp e, se o
atendimento foi marcado com antecedência, um lembrete na véspera. Ajuda a reduzir faltas.

Como no aviso de andamento, em violência nada vai pelo WhatsApp (o celular pode estar com quem agride):
o horário fica só registrado no caso, e a equipe combina pelo canal mais seguro.
Datas e horas mostradas à pessoa estão no horário de Brasília.
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Conversa, Mensagem, Triagem, UnidadeAtendimento, agora, local
from app.services import catalogo
from app.services.avisos import motivo_sem_aviso
from app.services.channels.envio import enviar_pelo_canal
from app.services.llm.traducao import traduzir

DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
# Lembrete: entre 20 h e 1 h antes, e só se a marcação foi feita com pelo menos 20 h de antecedência
JANELA_LEMBRETE = timedelta(hours=20)
MINIMO_ANTES = timedelta(hours=1)


def _hora(dt: datetime) -> str:
    return f"{dt.hour}h" if dt.minute == 0 else f"{dt.hour}h{dt.minute:02d}"


def descrever(quando: datetime, referencia: Optional[datetime] = None) -> str:
    """'amanhã, terça-feira (08/10), às 9h' — como a pessoa entende, no horário de Brasília."""
    q, ref = local(quando), local(referencia)
    dia = f"{DIAS[q.weekday()]} ({q:%d/%m})"
    if q.date() == ref.date():
        dia = f"hoje ({q:%d/%m})"
    elif q.date() == (ref + timedelta(days=1)).date():
        dia = f"amanhã, {dia}"
    return f"{dia}, às {_hora(q)}"


DURACAO = timedelta(hours=1)


def _utc(dt: datetime) -> str:
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _detalhes(triagem: Triagem) -> str:
    docs = "\n".join(f"- {d}" for d in (triagem.documentos_necessarios or []))
    return f"Atendimento da assistência social.\nLeve os documentos originais:\n{docs}" if docs else "Atendimento da assistência social."


def link_google(triagem: Triagem) -> str:
    """Link do Google Agenda já preenchido (abre a agenda e a pessoa só confirma). Sem conta conectada."""
    inicio = triagem.agendado_para
    return "https://calendar.google.com/calendar/render?" + urlencode({
        "action": "TEMPLATE", "text": "Atendimento no CRAS",
        "dates": f"{_utc(inicio)}/{_utc(inicio + DURACAO)}",
        "details": _detalhes(triagem), "location": triagem.agendado_local or "CRAS", "ctz": "America/Sao_Paulo",
    })


def token_agenda(triagem_id: str) -> str:
    """Código do link do .ics: sem ele, ninguém abre o horário de outra pessoa."""
    return hmac.new(settings.SECRET_KEY.encode(), f"agenda:{triagem_id}".encode(), hashlib.sha256).hexdigest()[:24]


def link_ics(triagem: Triagem) -> Optional[str]:
    if not settings.PUBLICO_URL:
        return None
    return f"{settings.PUBLICO_URL.rstrip('/')}/webhooks/agenda/{triagem.id}/{token_agenda(triagem.id)}.ics"


def arquivo_ics(triagem: Triagem) -> str:
    """Evento no formato que a agenda do iPhone (e de qualquer celular) abre."""
    def esc(t: str) -> str:
        return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    inicio = triagem.agendado_para
    linhas = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ponte Social//Agenda do CRAS//PT-BR", "METHOD:PUBLISH", "BEGIN:VEVENT",
        f"UID:{triagem.id}@ponte-social", f"DTSTAMP:{_utc(agora())}", f"DTSTART:{_utc(inicio)}", f"DTEND:{_utc(inicio + DURACAO)}",
        "SUMMARY:Atendimento no CRAS", f"LOCATION:{esc(triagem.agendado_local or 'CRAS')}", f"DESCRIPTION:{esc(_detalhes(triagem))}",
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Atendimento no CRAS", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return "\r\n".join(linhas) + "\r\n"


async def _local_padrao(session: AsyncSession, triagem: Triagem) -> str:
    unidade = await session.get(UnidadeAtendimento, triagem.unidade_id) if triagem.unidade_id else None
    if not unidade:
        return "CRAS"
    return f"{unidade.nome} ({unidade.endereco})" if unidade.endereco else unidade.nome


async def _avisar(session: AsyncSession, triagem: Triagem, chave: str, quando: datetime, com_agenda: bool = False) -> dict:
    motivo = motivo_sem_aviso(triagem)
    if motivo:
        return {"enviado": False, "motivo": motivo}
    conversa = await session.get(Conversa, triagem.conversa_id)
    if conversa is None:
        return {"enviado": False, "motivo": "conversa_apagada"}
    texto = (catalogo.texto(chave, triagem.unidade_id)
             .replace("{quando}", descrever(quando))
             .replace("{local}", triagem.agendado_local or "CRAS")
             .replace("{cras}", triagem.agendado_local or "CRAS"))
    textos = [texto]
    if com_agenda:
        link = link_google(triagem)
        ics = link_ics(triagem)
        textos.append(catalogo.texto("agenda_salvar", triagem.unidade_id).replace("{link}", link)
                      + (f"\n\nNo iPhone, use este: {ics}" if ics else ""))
    enviados = await traduzir(textos, "es") if conversa.idioma == "es" else textos
    for i, (enviado, pt) in enumerate(zip(enviados, textos)):
        if not await enviar_pelo_canal(conversa, enviado):
            if i == 0:
                return {"enviado": False, "motivo": "falha_no_envio"}
            break
        session.add(Mensagem(conversa_id=conversa.telefone_hash, autor="bot", texto=enviado, traducao=pt if pt != enviado else None))
    return {"enviado": True, "motivo": None}


async def marcar(session: AsyncSession, triagem: Triagem, quando: datetime, local_texto: Optional[str],
                 usuario: str, avisar: bool = True) -> dict:
    triagem.agendado_para = quando
    triagem.agendado_local = (local_texto or "").strip()[:160] or await _local_padrao(session, triagem)
    triagem.agendado_em, triagem.agendado_por, triagem.lembrete_enviado_em = agora(), usuario, None
    aviso = await _avisar(session, triagem, "agendamento_confirmado", quando, com_agenda=True) if avisar else None
    await session.commit()
    return {"aviso": aviso}


async def desmarcar(session: AsyncSession, triagem: Triagem, avisar: bool = True) -> dict:
    quando = triagem.agendado_para
    aviso = await _avisar(session, triagem, "agendamento_cancelado", quando) if avisar and quando else None
    triagem.agendado_para = triagem.agendado_local = triagem.agendado_em = triagem.agendado_por = None
    triagem.lembrete_enviado_em = None
    await session.commit()
    return {"aviso": aviso}


async def enviar_lembretes(session: AsyncSession, momento: Optional[datetime] = None) -> int:
    """Roda a cada 30 min (junto do retorno de 3 dias). Devolve quantos lembretes saíram."""
    momento = momento or agora()
    q = select(Triagem).where(Triagem.agendado_para.is_not(None), Triagem.lembrete_enviado_em.is_(None),
                              Triagem.status.not_in(["CONCLUIDO", "ARQUIVADO"]))
    enviados = 0
    for t in (await session.execute(q)).scalars():
        para = local(t.agendado_para)
        feito = local(t.agendado_em) if t.agendado_em else para - JANELA_LEMBRETE * 2
        agora_local = local(momento)
        if not (agora_local + MINIMO_ANTES <= para <= agora_local + JANELA_LEMBRETE) or para - feito < JANELA_LEMBRETE:
            continue
        motivo = motivo_sem_aviso(t)
        resultado = {"enviado": False} if motivo else await _avisar(session, t, "agendamento_lembrete", t.agendado_para)
        if resultado["enviado"] or motivo:
            t.lembrete_enviado_em = momento  # violência: marca como resolvido sem enviar
            enviados += int(resultado["enviado"])
    await session.commit()
    return enviados
