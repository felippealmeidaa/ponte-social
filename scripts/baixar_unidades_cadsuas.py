"""
Baixa da consulta pública do CadSUAS (cadastro oficial do SUAS, mantido pela própria prefeitura) as unidades de
Anápolis: CRAS, CREAS, Centro POP e Posto do Cadastro Único, com endereço, e-mail institucional, dias e horário de
atendimento. Grava em data/unidades_anapolis_cadsuas.json.

Não guarda a aba de Recursos Humanos (traz nome de servidor). O telefone o próprio CadSUAS oculta (LGPD).

    .venv/Scripts/python scripts/baixar_unidades_cadsuas.py
"""
import html
import http.cookiejar
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "data" / "unidades_anapolis_cadsuas.json"
BASE = "https://aplicacoes.mds.gov.br/cadsuas/"
UF, MUNICIPIO = "GO", "ANAPOLIS"
TIPOS = {"05": "CRAS", "26": "CREAS", "32": "CENTRO_POP", "37": "POSTO_CADUNICO"}  # códigos da lista do CadSUAS

abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
abridor.addheaders = [("User-Agent", "Mozilla/5.0 (Ponte Social - projeto academico)")]


def abrir(pagina: str, dados: dict = None) -> str:
    corpo = urllib.parse.urlencode(dados).encode() if dados is not None else None
    resposta = abridor.open(BASE + pagina, corpo, timeout=60).read().decode("latin-1")
    time.sleep(1)  # consulta pública: sem pressa
    return resposta


def linhas(pagina_html: str) -> list:
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", pagina_html, flags=re.S)
    s = s[max(0, s.find('id="content"')):]
    texto = html.unescape(re.sub(r"<[^>]+>", "\n", s))
    return [l for l in (" ".join(x.split()) for x in texto.splitlines()) if l and l != "\xa0"]


def depois(ls: list, rotulo: str) -> str:
    for i, l in enumerate(ls):
        if l.startswith(rotulo) and i + 1 < len(ls):
            return ls[i + 1]
    return ""


def _sem_acento(t: str) -> str:
    return t.upper().translate(str.maketrans("ÁÀÂÃÉÊÍÓÔÕÚÇ", "AAAAEEIOOOUC"))


def main() -> None:
    abrir("visualizarConsultaExterna.html")
    filtro = {"consultaExternaHelper.tipoBusca": "ent", "consultaExternaHelper.endereco.municipio.uf.sigla": UF}
    pagina = abrir("visualizarConsultaExterna.html", filtro)
    lista = re.search(r'name="consultaExternaHelper.endereco.municipio.id".*?</select>', pagina, re.S).group(0)
    municipio = next(v for v, n in re.findall(r'<option value="(\d+)"[^>]*>([^<]+)', lista) if _sem_acento(n.strip()) == MUNICIPIO)
    filtro["consultaExternaHelper.endereco.municipio.id"] = municipio

    unidades = []
    for codigo_tipo, tipo in TIPOS.items():
        resultado = abrir("pesquisarConsultaExterna.html", {**filtro, "consultaExternaHelper.tipoEntidade.id": codigo_tipo,
                                                             "consultaExternaHelper.possuiCeas": "0",
                                                             "consultaExternaHelper.cpfcnpj": "", "consultaExternaHelper.nomeEntidade": ""})
        for codigo in dict.fromkeys(re.findall(r"aba=dados_cadastrais&(?:amp;)?codigo=(\d+)", resultado)):
            ficha = "visualizarEntidadeConsultaExterna.html?aba={}&codigo=" + codigo
            cadastro = linhas(abrir(ficha.format("dados_cadastrais")))
            contato = linhas(abrir(ficha.format("endereco_contatos")))
            abrir(ficha.format("dados_gerenciais_rh"))  # a sessão exige passar por ela; o conteúdo (servidores) é descartado
            try:
                caracteristicas = linhas(abrir(ficha.format("dados_gerenciais_caracteristicas")))
            except Exception:
                caracteristicas = []
            dias = []
            for i, l in enumerate(caracteristicas):
                if l.startswith("Dias de Atendimento"):
                    for x in caracteristicas[i + 1:]:
                        if not x.startswith("- "):
                            break
                        dias.append(x[2:].strip())
            horario = re.search(r"Início:\s*(\d{2}:\d{2})\s*Término:\s*(\d{2}:\d{2})", " ".join(caracteristicas))
            endereco = depois(contato, "Endereço:")
            cep = re.search(r"CEP:\s*([\d.\-]+)", endereco)
            email = depois(contato, "E-mail Institucional:")
            unidades.append({
                "codigo_cadsuas": codigo, "identificador": depois(cadastro, "Nº Identificador:"), "tipo": tipo,
                "nome": depois(cadastro, "Nome da Entidade:"), "implantacao": depois(cadastro, "Data de Implantação:"),
                "endereco": endereco, "cep": cep.group(1).replace(".", "") if cep else None,
                "email": email if "@" in email else None,
                "dias_atendimento": dias,
                "horario_inicio": horario.group(1) if horario else None, "horario_fim": horario.group(2) if horario else None,
                "area_atuacao": depois(caracteristicas, "Área Geográfica de Atuação:").lstrip("- ") or None,
            })
            print(f"{tipo:15} {unidades[-1]['nome']}")

    dados = {
        "municipio": "Anápolis/GO",
        "fonte": f"CadSUAS — consulta pública ({BASE}visualizarConsultaExterna.html)",
        "consultado_em": date.today().isoformat(),
        "observacao": "Cadastro oficial mantido pela própria prefeitura no CadSUAS. Telefones são ocultados pelo CadSUAS "
                      "(LGPD). Lista de servidores não é coletada. Unidade sem horário = não informado no CadSUAS. "
                      "Confirmar horários com a Secretaria antes de divulgar.",
        "unidades": unidades,
    }
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(unidades)} unidades gravadas em {SAIDA}")


if __name__ == "__main__":
    main()
