"""
Converte uma página do gov.br (HTML salvo) em Markdown para a Base de conhecimento: só o miolo da página
(bloco id="content"), sem menu, rodapé nem botões de compartilhar. Títulos viram ## e tabelas viram linhas
"coluna | coluna", que o fatiador da base corta como tabela.

    python scripts/converter_pagina_govbr.py pagina.html saida.md "Título do documento"
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

PULAR = {"script", "style", "nav", "footer", "button", "form", "noscript", "svg"}
VAZIAS = {"br", "img", "meta", "link", "hr", "input", "col", "area", "base", "wbr", "source"}
TITULOS = {"h1": "#", "h2": "##", "h3": "###", "h4": "####"}
# Pedaços do gov.br que não são conteúdo
CLASSES_FORA = ("social-links", "documentActions", "documentByLine", "outros-links", "portlet", "voltar-topo",
                "rating", "plone-toolbar", "keywords", "relatedItems")


class Conv(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.saida, self.atual = [], []
        self.pulando = []  # pilha de tags dentro de um trecho pulado
        self.titulo = None
        self.celulas = None

    def _fecha_linha(self, prefixo=""):
        texto = " ".join("".join(self.atual).split())
        self.atual = []
        if texto:
            self.saida.append(f"{prefixo}{texto}")

    def handle_starttag(self, tag, attrs):
        if tag in VAZIAS:
            if tag == "br" and not self.pulando:
                self.atual.append(" ")
            return
        if self.pulando:
            self.pulando.append(tag)
            return
        a = dict(attrs)
        classes = a.get("class") or ""
        if tag in PULAR or any(c in classes for c in CLASSES_FORA) or a.get("aria-hidden") == "true":
            self.pulando.append(tag)
            return
        if tag in TITULOS:
            self._fecha_linha()
            self.titulo = tag
        elif tag == "tr":
            self._fecha_linha()
            self.celulas = []
        elif tag in ("td", "th"):
            self.atual = []
        elif tag == "li":
            self._fecha_linha()
            self.atual.append("- ")
        elif tag in ("p", "div", "section", "article", "table", "ul", "ol", "dl", "dt", "dd", "blockquote"):
            self._fecha_linha()

    def handle_endtag(self, tag):
        if self.pulando:
            if tag in self.pulando:
                while self.pulando and self.pulando.pop() != tag:
                    pass
            return
        if tag in TITULOS and self.titulo == tag:
            texto = " ".join("".join(self.atual).split())
            self.atual = []
            if texto:
                self.saida += ["", f"{TITULOS[tag]} {texto}", ""]
            self.titulo = None
        elif tag in ("td", "th") and self.celulas is not None:
            self.celulas.append(" ".join("".join(self.atual).split()))
            self.atual = []
        elif tag == "tr" and self.celulas is not None:
            if any(self.celulas):
                self.saida.append(" | ".join(self.celulas))
            self.celulas = None
        elif tag in ("p", "li", "div", "section", "dt", "dd", "table", "blockquote"):
            self._fecha_linha()

    def handle_data(self, data):
        if not self.pulando:
            self.atual.append(data.replace("\r", " ").replace("\n", " "))


def miolo(html: str) -> str:
    """Do bloco id="content" até o rodapé do portal."""
    inicio = re.search(r'<(div|main|article)[^>]*id="content"', html)
    fim = re.search(r'<(footer|div)[^>]*id="(portal-footer|footer)[^"]*"', html)
    return html[inicio.start() if inicio else 0: fim.start() if fim and (not inicio or fim.start() > inicio.start()) else len(html)]


def converter(origem: Path, destino: Path, titulo: str, fonte: str = "") -> int:
    c = Conv()
    c.feed(miolo(origem.read_text(encoding="utf-8", errors="replace")))
    c._fecha_linha()
    linhas, anterior = [f"# {titulo}", ""] + ([f"Fonte: {fonte}", ""] if fonte else []), None
    for l in c.saida:
        if l.startswith("# ") or l == anterior or l in ("-", "Compartilhe:", "Copiar para área de transferência"):
            continue  # o h1 da página repete o título; linhas iguais seguidas vêm de menus duplicados
        if re.fullmatch(r"REV \d+|\d{2}/\d{2}/\d{4}|Informação não encontrada.*", l):
            continue  # carimbo de revisão e aviso vazio das perguntas frequentes
        if not l.startswith("- ") and len(l) <= 180 and re.match(r"^\S.{8,}\?$", l):
            linhas += ["", f"### {l}"]  # pergunta (numerada ou não): cada uma vira um trecho na base
        else:
            linhas.append(l)
        anterior = l
    texto = re.sub(r"\n{3,}", "\n\n", "\n".join(linhas)).strip() + "\n"
    destino.write_text(texto, encoding="utf-8")
    return len(texto)


if __name__ == "__main__":
    print(converter(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else ""))
