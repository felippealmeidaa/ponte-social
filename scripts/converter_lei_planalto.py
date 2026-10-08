"""Converte as leis do Planalto (HTML) em texto: tira o texto revogado (riscado), scripts e estilos."""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

PULAR = {"strike", "s", "del", "script", "style", "head", "title"}
BLOCO = {"p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4", "table", "blockquote"}
VAZIAS = {"br", "img", "meta", "link", "hr", "input", "col", "area", "base", "wbr"}


class Conv(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pilha = []  # tags abertas dentro de um trecho pulado
        self.partes = []

    @property
    def pulando(self):
        return bool(self.pilha)

    def handle_starttag(self, tag, attrs):
        if tag in VAZIAS:
            if tag == "br" and not self.pulando:
                self.partes.append("\n")
            return
        estilo = (dict(attrs).get("style") or "").replace(" ", "").lower()
        if self.pulando:
            self.pilha.append(tag)
            return
        if tag in PULAR or "line-through" in estilo:
            self.pilha.append(tag)
            return
        if tag in BLOCO:
            self.partes.append("\n")

    def handle_endtag(self, tag):
        if self.pulando:
            if tag in self.pilha:
                while self.pilha and self.pilha.pop() != tag:
                    pass
            return
        if tag in BLOCO:
            self.partes.append("\n")

    def handle_data(self, data):
        if not self.pulando:
            self.partes.append(data.replace("\r", " ").replace("\n", " "))


def converter(origem: Path, destino: Path, titulo: str) -> int:
    bruto = origem.read_bytes()
    if bruto[:2] in (b"\xff\xfe", b"\xfe\xff"):
        texto = bruto[: len(bruto) // 2 * 2].decode("utf-16", errors="replace")
    else:
        m = re.search(rb'charset=["\']?([\w-]+)', bruto[:3000], re.I)
        texto = bruto.decode(m.group(1).decode() if m else "windows-1252", errors="replace")
    c = Conv()
    c.feed(texto)
    linhas = [" ".join(l.split()) for l in "".join(c.partes).splitlines()]
    linhas = [l for l in linhas if l and not re.fullmatch(
        r"(\(Vide.*?\)|\(Revogad[oa].*?\)|Texto compilado|Mensagem de veto|Vigência|Regulamento|Produção de efeitos)", l)]
    saida, anterior = [f"# {titulo}", ""], None
    for l in linhas:
        if re.match(r"^(CAPÍTULO|TÍTULO|Seção|Subseção|SEÇÃO|LIVRO)\b", l):
            saida += ["", f"## {l}"]
        elif re.match(r"^Art\. ?\d", l):
            saida += ["", l]
        elif l != anterior:
            saida.append(l)
        anterior = l
    destino.write_text("\n".join(saida).strip() + "\n", encoding="utf-8")
    return len(saida)


if __name__ == "__main__":
    print(converter(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]))
