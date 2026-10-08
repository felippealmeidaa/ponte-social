"""
Relatório mensal (aba Indicadores → Relatório do mês): necessidades, bairros, tempo de resposta, notas e acerto da IA.

O mês é contado no horário de Brasília (um caso das 22h do dia 31 é daquele mês). Os exemplos de demonstração ficam
de fora, como nos Indicadores. A mesma conta vira a página para imprimir/salvar em PDF e a planilha (.xlsx).
"""
import io
import json
from collections import Counter
from datetime import date, datetime, timezone
from statistics import median
from typing import Any, Dict, List, Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FUSO_LOCAL, Triagem, UnidadeAtendimento, local
from app.services import demonstracao
from app.services.ml.train_evaluator import REPORT_OUTPUT

# Os mesmos nomes do painel (frontend/src/vocabulario.ts)
NOMES_CATEGORIA = {
    "violencia_protecao": "Violência ou ameaça", "renda_beneficio": "Renda e benefícios",
    "cadastro_atualizacao": "Cadastro Único", "moradia": "Moradia", "documentacao": "Documentos",
    "alimentacao": "Alimentação", "pessoa_idosa_pcd": "Pessoa idosa ou com deficiência",
    "trabalho_renda": "Trabalho e cursos", "nao_identificado": "Não identificado",
}
NOMES_STATUS = {
    "URGENTE_CREAS": "Urgente", "PENDENTE": "Aguardando", "EM_ATENDIMENTO": "Em atendimento",
    "ENCAMINHADO_CREAS": "Encaminhado ao CREAS", "CONCLUIDO": "Concluído", "ARQUIVADO": "Arquivado",
}
NOMES_CANAL = {"whatsapp": "WhatsApp", "web": "Painel", "presencial": "Presencial"}
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
SEM_BAIRRO = {"", "Não informado", "Localização pelo WhatsApp"}
URGENTE = "URGENTE_VIOLENCIA"


def nome_categoria(c: str) -> str:
    return NOMES_CATEGORIA.get(c, c)


def nome_mes(ano: int, mes: int) -> str:
    return f"{MESES[mes - 1]} de {ano}"


def limites_do_mes(ano: int, mes: int) -> tuple[datetime, datetime]:
    """Início e fim do mês em Brasília, convertidos para UTC (como o banco guarda)."""
    inicio = datetime(ano, mes, 1, tzinfo=FUSO_LOCAL)
    fim = datetime(ano + (mes == 12), mes % 12 + 1, 1, tzinfo=FUSO_LOCAL)
    return inicio.astimezone(timezone.utc), fim.astimezone(timezone.utc)


def mes_anterior(ano: int, mes: int) -> tuple[int, int]:
    return (ano - 1, 12) if mes == 1 else (ano, mes - 1)


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def minutos_ate_resposta(t: Triagem) -> float:
    return (_utc(t.atendido_em) - _utc(t.criado_em)).total_seconds() / 60


async def tempo_resposta(session: AsyncSession, itens: Sequence[Triagem]) -> List[Dict[str, Any]]:
    """Minutos entre a chegada e a primeira resposta da equipe, por CRAS, separando urgentes dos demais (mediana)."""
    grupos: Dict[Optional[str], List[Triagem]] = {}
    for t in itens:
        grupos.setdefault(t.unidade_id, []).append(t)
    nomes = {u.id: u.nome for u in (await session.execute(select(UnidadeAtendimento))).scalars()}
    saida = []
    for unidade_id, casos in grupos.items():
        linha: Dict[str, Any] = {"unidade_id": unidade_id, "nome": nomes.get(unidade_id, "Sem CRAS definido (coordenação)")}
        for chave, filtro in (("urgentes", lambda t: t.prioridade == URGENTE), ("demais", lambda t: t.prioridade != URGENTE)):
            do_grupo = [t for t in casos if filtro(t)]
            atendidos = [minutos_ate_resposta(t) for t in do_grupo if t.atendido_em]
            linha[chave] = {"casos": len(do_grupo), "atendidos": len(atendidos),
                            "mediana_min": round(median(atendidos)) if atendidos else None}
        saida.append(linha)
    return sorted(saida, key=lambda x: x["nome"])


async def _casos(session: AsyncSession, ano: int, mes: int, unidade_id: Optional[str]) -> List[Triagem]:
    inicio, fim = limites_do_mes(ano, mes)
    consulta = demonstracao.filtro_casos(select(Triagem).where(Triagem.criado_em >= inicio, Triagem.criado_em < fim),
                                         demonstracao.ligado())
    if unidade_id:
        consulta = consulta.where(Triagem.unidade_id == unidade_id)
    return list((await session.execute(consulta)).scalars().all())


def _acerto_ia(itens: Sequence[Triagem]) -> Dict[str, Any]:
    """Como a sugestão da IA se saiu nos casos reais do mês: confirmação da pessoa e correção da equipe.
    "Violência não percebida" = a equipe corrigiu para violência um caso que a IA tinha posto em outra necessidade."""
    confirmadas = [t for t in itens if t.categoria_confirmada_pelo_cidadao]
    corrigidas = [t for t in itens if t.corrigida_por and t.categoria != t.categoria_modelo]
    trocas = Counter((t.categoria_modelo, t.categoria) for t in corrigidas)
    return {
        "casos": len(itens),
        "confirmadas_pela_pessoa": len(confirmadas),
        "aceitas_pela_pessoa": sum(t.categoria == t.categoria_modelo for t in confirmadas),
        "corrigidas_pela_equipe": len(corrigidas),
        "iguais_a_sugestao": sum(t.categoria == t.categoria_modelo for t in itens),
        "violencia_nao_percebida": sum(t.categoria == "violencia_protecao" and t.categoria_modelo != "violencia_protecao" for t in itens),
        "trocas_mais_comuns": [{"de": nome_categoria(de), "para": nome_categoria(para), "casos": n} for (de, para), n in trocas.most_common(5)],
    }


def _modelo_em_uso() -> Optional[Dict[str, Any]]:
    """Números do teste fixo do modelo em uso (os mesmos da aba Modelo de IA)."""
    try:
        with open(REPORT_OUTPUT, encoding="utf-8") as f:
            r = json.load(f)
        s = r["modelo_final"]["teste_sistema_completo"]
        return {"nome": r["modelo_final"]["nome"], "f1_macro": round(s["f1_macro"], 3), "acuracia": round(s["acuracia"], 3),
                "recall_violencia": round(s["recall_violencia"], 3), "avaliado_em": r.get("timestamp")}
    except (OSError, KeyError, ValueError):
        return None


async def montar(session: AsyncSession, ano: int, mes: int, unidade_id: Optional[str] = None) -> Dict[str, Any]:
    itens = await _casos(session, ano, mes, unidade_id)
    anterior = await _casos(session, *mes_anterior(ano, mes), unidade_id)
    nomes_unidade = {u.id: u.nome for u in (await session.execute(select(UnidadeAtendimento))).scalars()}

    por_categoria = []
    for categoria, total in Counter(t.categoria for t in itens).most_common():
        casos = [t for t in itens if t.categoria == categoria]
        respondidos = [minutos_ate_resposta(t) for t in casos if t.atendido_em]
        por_categoria.append({
            "categoria": categoria, "nome": nome_categoria(categoria), "casos": total,
            "mes_anterior": sum(t.categoria == categoria for t in anterior),
            "concluidos": sum(t.status == "CONCLUIDO" for t in casos),
            "mediana_resposta_min": round(median(respondidos)) if respondidos else None,
        })

    por_bairro = []
    bairros = Counter((t.bairro or "").strip() for t in itens if (t.bairro or "").strip() not in SEM_BAIRRO)
    for bairro, total in bairros.most_common():
        casos = [t for t in itens if (t.bairro or "").strip() == bairro]
        principal, n = Counter(t.categoria for t in casos).most_common(1)[0]
        por_bairro.append({"bairro": bairro, "casos": total, "principal": nome_categoria(principal), "principal_casos": n,
                           "urgentes": sum(t.prioridade == URGENTE for t in casos)})

    notas = [t for t in itens if t.avaliacao]
    por_unidade_nota: Dict[Optional[str], List[int]] = {}
    for t in notas:
        por_unidade_nota.setdefault(t.unidade_id, []).append(t.avaliacao)

    return {
        "ano": ano, "mes": mes, "titulo": nome_mes(ano, mes),
        "unidade": nomes_unidade.get(unidade_id, "Todas as unidades") if unidade_id else "Todas as unidades",
        "gerado_em": local().isoformat(timespec="minutes"),
        "demonstracao": demonstracao.ligado(),
        "resumo": {
            "casos": len(itens), "mes_anterior": len(anterior),
            "urgentes": sum(t.prioridade == URGENTE for t in itens),
            "concluidos": sum(t.status == "CONCLUIDO" for t in itens),
            "em_aberto": sum(t.status in {"PENDENTE", "URGENTE_CREAS", "EM_ATENDIMENTO"} for t in itens),
            "sem_bairro": sum((t.bairro or "").strip() in SEM_BAIRRO for t in itens),
            "por_canal": {NOMES_CANAL.get(c, c): n for c, n in Counter(t.canal for t in itens).most_common()},
            "por_situacao": {NOMES_STATUS.get(s, s): n for s, n in Counter(t.status for t in itens).most_common()},
        },
        "por_categoria": por_categoria,
        "por_bairro": por_bairro,
        "tempo_resposta": await tempo_resposta(session, itens),
        "notas": {
            "respostas": len(notas),
            "media": round(sum(t.avaliacao for t in notas) / len(notas), 1) if notas else None,
            "por_nota": {str(n): sum(t.avaliacao == n for t in notas) for n in range(5, 0, -1)},
            "por_unidade": sorted(({"nome": nomes_unidade.get(u, "Sem CRAS definido (coordenação)"), "respostas": len(v),
                                    "media": round(sum(v) / len(v), 1)} for u, v in por_unidade_nota.items()), key=lambda x: x["nome"]),
        },
        "acerto_ia": _acerto_ia(itens),
        "modelo": _modelo_em_uso(),
    }


# ---------- Planilha ----------

_TITULO = Font(bold=True, size=14)
_CABECALHO = Font(bold=True, color="FFFFFF")
_FUNDO_CABECALHO = PatternFill("solid", fgColor="0D4A47")


def _tabela(ws, linha: int, cabecalho: List[str], linhas: List[List[Any]]) -> int:
    for col, texto in enumerate(cabecalho, start=1):
        c = ws.cell(row=linha, column=col, value=texto)
        c.font, c.fill = _CABECALHO, _FUNDO_CABECALHO
    for i, valores in enumerate(linhas, start=linha + 1):
        for col, v in enumerate(valores, start=1):
            ws.cell(row=i, column=col, value=v)
    if not linhas:
        ws.cell(row=linha + 1, column=1, value="Nenhum caso no mês.").font = Font(italic=True, color="5D6A79")
    return linha + max(len(linhas), 1) + 2


def _aba(wb: Workbook, nome: str, titulo: str, larguras: List[int]):
    ws = wb.create_sheet(nome)
    ws["A1"] = titulo
    ws["A1"].font = _TITULO
    for i, w in enumerate(larguras, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    return ws


def _minutos(m: Optional[int]) -> Optional[float]:
    """Em horas, para a planilha somar e fazer gráfico."""
    return round(m / 60, 1) if m is not None else None


def planilha(dados: Dict[str, Any]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    r, titulo = dados["resumo"], f"Relatório de {dados['titulo']} — {dados['unidade']}"

    ws = _aba(wb, "Resumo", titulo, [38, 16])
    ws["A2"] = (f"Gerado em {datetime.fromisoformat(dados['gerado_em']).strftime('%d/%m/%Y às %H:%M')} (horário de Brasília). "
                + ("MODO DEMONSTRAÇÃO: inclui casos fictícios." if dados.get("demonstracao") else "Exemplos de demonstração não entram."))
    ws["A2"].font = Font(italic=True, color="5D6A79")
    linhas = [["Casos no mês", r["casos"]], ["Casos no mês anterior", r["mes_anterior"]],
              ["Com sinal de violência", r["urgentes"]], ["Concluídos", r["concluidos"]], ["Ainda em aberto", r["em_aberto"]],
              ["Sem bairro informado", r["sem_bairro"]]]
    linhas += [[f"Entrada: {k}", v] for k, v in r["por_canal"].items()]
    linhas += [[f"Situação hoje: {k}", v] for k, v in r["por_situacao"].items()]
    _tabela(ws, 4, ["Indicador", "Valor"], linhas)

    ws = _aba(wb, "Necessidades", titulo, [34, 12, 16, 13, 26])
    _tabela(ws, 3, ["Necessidade", "Casos", "Mês anterior", "Concluídos", "Primeira resposta (h, mediana)"],
            [[c["nome"], c["casos"], c["mes_anterior"], c["concluidos"], _minutos(c["mediana_resposta_min"])] for c in dados["por_categoria"]])

    ws = _aba(wb, "Bairros", titulo, [34, 10, 34, 18, 14])
    _tabela(ws, 3, ["Bairro", "Casos", "Necessidade mais pedida", "Casos dessa necessidade", "Com violência"],
            [[b["bairro"], b["casos"], b["principal"], b["principal_casos"], b["urgentes"]] for b in dados["por_bairro"]])

    ws = _aba(wb, "Tempo de resposta", titulo, [36, 12, 14, 24, 12, 14, 24])
    ws["A2"] = "Da chegada do caso até a equipe assumir ou marcar “Em atendimento”. Mediana em horas."
    ws["A2"].font = Font(italic=True, color="5D6A79")
    _tabela(ws, 4, ["Unidade", "Violência: casos", "Violência: respondidos", "Violência: mediana (h)",
                    "Demais: casos", "Demais: respondidos", "Demais: mediana (h)"],
            [[t["nome"], t["urgentes"]["casos"], t["urgentes"]["atendidos"], _minutos(t["urgentes"]["mediana_min"]),
              t["demais"]["casos"], t["demais"]["atendidos"], _minutos(t["demais"]["mediana_min"])] for t in dados["tempo_resposta"]])

    n = dados["notas"]
    ws = _aba(wb, "Notas", titulo, [36, 12, 12])
    ws["A2"] = (f"Média {str(n['media']).replace('.', ',')} de 5 em {n['respostas']} respostas." if n["media"] is not None
                else "Nenhuma nota recebida no mês.")
    proxima = _tabela(ws, 4, ["Nota", "Respostas"], [[f"Nota {k}", v] for k, v in n["por_nota"].items()])
    _tabela(ws, proxima, ["Unidade", "Respostas", "Média"], [[u["nome"], u["respostas"], u["media"]] for u in n["por_unidade"]])

    a, m = dados["acerto_ia"], dados["modelo"]
    ws = _aba(wb, "Acerto da IA", titulo, [52, 14])
    proxima = _tabela(ws, 3, ["Nos casos reais do mês", "Casos"], [
        ["Casos com sugestão da IA", a["casos"]],
        ["Necessidade final igual à sugerida", a["iguais_a_sugestao"]],
        ["Pessoas que responderam “está certo?”", a["confirmadas_pela_pessoa"]],
        ["… e aceitaram a sugestão", a["aceitas_pela_pessoa"]],
        ["Corrigidas pela equipe", a["corrigidas_pela_equipe"]],
        ["Violência que a IA não percebeu (corrigida pela equipe)", a["violencia_nao_percebida"]],
    ])
    if a["trocas_mais_comuns"]:
        proxima = _tabela(ws, proxima, ["Correção mais comum (IA → equipe)", "Casos"],
                          [[f"{t['de']} → {t['para']}", t["casos"]] for t in a["trocas_mais_comuns"]])
    if m:
        _tabela(ws, proxima, [f"Modelo em uso no teste fixo ({m['nome']})", "Valor"],
                [["F1 macro", m["f1_macro"]], ["Acurácia", m["acuracia"]], ["Recall de violência", m["recall_violencia"]]])

    saida = io.BytesIO()
    wb.save(saida)
    return saida.getvalue()


def nome_arquivo(dados: Dict[str, Any]) -> str:
    return f"relatorio-{dados['ano']}-{dados['mes']:02d}.xlsx"


def mes_valido(texto: Optional[str]) -> tuple[int, int]:
    """"2026-09" → (2026, 9). Sem mês: o mês corrente em Brasília."""
    if not texto:
        hoje = local().date()
        return hoje.year, hoje.month
    ano, mes = (int(p) for p in texto.split("-", 1))
    date(ano, mes, 1)  # ValueError se não existir
    return ano, mes
