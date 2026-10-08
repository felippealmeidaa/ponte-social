"""
Gera docs/modelo_relatos_treino.xlsx: a planilha que o grupo preenche com relatos novos para o treino.
Importa no painel em Classificação › Dados de treino › Importar. Regras vêm de docs/guia_rotulagem.md.

    .venv/Scripts/python scripts/gerar_modelo_relatos.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

SAIDA = Path(__file__).resolve().parent.parent / "docs" / "modelo_relatos_treino.xlsx"
LINHAS = 400
META = 40  # relatos novos por necessidade nesta rodada

# Mesmos nomes de backend/app/services/ml/exemplos.py (NOMES_CATEGORIA) e do painel
CATEGORIAS = [
    ("Violência ou ameaça", "violencia_protecao",
     "Qualquer sinal de violência física, sexual, psicológica, patrimonial ou negligência grave, contra a pessoa ou "
     "contra outra (criança, idoso, pessoa com deficiência). Inclui ameaça, perseguição, medo do agressor, "
     "descumprimento de medida protetiva, exploração e abuso.",
     "Briga de vizinho por barulho sem ameaça; conflito familiar sem violência.",
     "to com medo de voltar pra casa, ele quebrou meu celular e falou que da proxima vez sou eu"),
    ("Renda e benefícios", "renda_beneficio",
     "Falta de dinheiro para o básico, pedido de benefício em dinheiro (Bolsa Família, BPC, auxílio, tarifa social, "
     "auxílio gás), dúvida sobre ter direito a um benefício.",
     "Pedido de emprego (Trabalho e cursos); benefício bloqueado por cadastro desatualizado (Cadastro Único).",
     "meu bolsa família não caiu esse mês"),
    ("Cadastro Único", "cadastro_atualizacao",
     "Inscrever, atualizar, incluir ou excluir pessoa, consultar NIS, folha resumo, recadastramento, benefício "
     "bloqueado por cadastro.",
     "Só perguntar se tem direito ao Bolsa Família, sem falar do cadastro (Renda e benefícios).",
     "nasceu meu filho, como coloco ele no cadunico?"),
    ("Moradia", "moradia",
     "Despejo, falta de onde morar, situação de rua, casa em risco (rachadura, alagamento), aluguel social, programa "
     "habitacional, abrigo.",
     "Fugir de casa por violência (Violência ou ameaça).",
     "o dono pediu a casa e eu tenho até sexta pra sair"),
    ("Documentos", "documentacao",
     "Tirar ou refazer documento (RG/CIN, CPF, certidão, carteira de trabalho), gratuidade de segunda via, registro "
     "de nascimento.",
     "Perguntar quais documentos levar a outro serviço: rotule pela necessidade principal.",
     "molhou tudo na enchente, perdi a certidão das crianças"),
    ("Alimentação", "alimentacao",
     "Fome, falta de comida em casa, cesta básica, leite ou fórmula para bebê, restaurante popular, banco de alimentos.",
     "Falta de dinheiro em geral sem mencionar comida (Renda e benefícios).",
     "hoje só teve arroz e amanhã não tem mais nada"),
    ("Pessoa idosa ou com deficiência", "pessoa_idosa_pcd",
     "Necessidade ligada à idade ou deficiência: BPC por idade/deficiência, cadeira de rodas, fralda, passe livre, "
     "centro de convivência, cuidado de idoso ou pessoa com deficiência, carteira do autista.",
     "Violência contra idoso ou pessoa com deficiência (Violência ou ameaça).",
     "meu pai teve AVC e não anda mais, preciso de uma cadeira"),
    ("Trabalho e cursos", "trabalho_renda",
     "Procurar emprego, currículo, curso profissionalizante, jovem aprendiz, MEI, vender artesanato, feira.",
     "Pedir benefício porque está desempregado (Renda e benefícios).",
     "faço salgado em casa, queria saber como vira MEI pra vender pra fora"),
]
ORIGENS = ["simulado", "profissional_descaracterizado", "cras_real"]

TINTA = "1F2A30"
FUNDO_CAB = PatternFill("solid", fgColor="0D4A47")
FUNDO_CLARO = PatternFill("solid", fgColor="EEF1F4")
FUNDO_ALERTA = PatternFill("solid", fgColor="FDECEA")
BRANCO = Font(bold=True, color="FFFFFF")
NEGRITO = Font(bold=True, color=TINTA)
TITULO = Font(bold=True, size=14, color=TINTA)
QUEBRA = Alignment(wrap_text=True, vertical="top")
FINA = Border(bottom=Side(style="thin", color="D5DBE0"))


def aba_relatos(livro: Workbook) -> None:
    aba = livro.active
    aba.title = "Relatos"
    colunas = [
        ("texto", 70, "O relato, escrito como a pessoa mandaria no WhatsApp. Já anonimizado."),
        ("categoria", 30, "A necessidade principal (escolha na lista)."),
        ("secundarias", 30, "Outras necessidades do relato, se houver (texto livre, opcional)."),
        ("origem", 26, "simulado = escrito pelo grupo; profissional_descaracterizado = caso contado por profissional, "
                       "sem identificar; cras_real = só com termo de consentimento."),
        ("rotulador", 12, "Suas iniciais (nunca o nome completo)."),
        ("observacao", 40, "Dúvida entre categorias ou justificativa (opcional)."),
    ]
    for i, (nome, largura, ajuda) in enumerate(colunas, start=1):
        celula = aba.cell(row=1, column=i, value=nome)
        celula.font, celula.fill, celula.alignment = BRANCO, FUNDO_CAB, Alignment(vertical="center")
        aba.column_dimensions[celula.column_letter].width = largura
    aba.freeze_panes = "A2"
    aba.row_dimensions[1].height = 22
    for linha in range(2, LINHAS + 2):
        for col in range(1, len(colunas) + 1):
            aba.cell(row=linha, column=col).alignment = QUEBRA

    lista = DataValidation(type="list", formula1="=Listas!$A$2:$A$9", allow_blank=True,
                           showErrorMessage=True, errorTitle="Necessidade",
                           error="Escolha uma das necessidades da lista.",
                           showInputMessage=True, promptTitle="Necessidade principal",
                           prompt="Se a pessoa só pudesse ir a um lugar amanhã, qual atendimento resolveria o mais importante?")
    origem = DataValidation(type="list", formula1="=Listas!$C$2:$C$4", allow_blank=True, showErrorMessage=True,
                            error="Escolha uma origem da lista.")
    texto = DataValidation(type="textLength", operator="between", formula1="12", formula2="600", allow_blank=True,
                           showErrorMessage=True, errorTitle="Tamanho do relato",
                           error="O relato precisa ter entre 12 e 600 caracteres (pelo menos 3 palavras).")
    for dv in (lista, origem, texto):
        aba.add_data_validation(dv)
    lista.add(f"B2:B{LINHAS + 1}")
    origem.add(f"D2:D{LINHAS + 1}")
    texto.add(f"A2:A{LINHAS + 1}")

    # Pinta de vermelho-claro: texto sem categoria, ou relato repetido na própria planilha
    faixa = f"A2:F{LINHAS + 1}"
    aba.conditional_formatting.add(faixa, FormulaRule(formula=['AND($A2<>"",$B2="")'], fill=FUNDO_ALERTA))
    aba.conditional_formatting.add(faixa, FormulaRule(formula=['AND($A2<>"",COUNTIF($A$2:$A$401,$A2)>1)'],
                                                      fill=FUNDO_ALERTA))

    ajuda = livro.create_sheet("Colunas")
    ajuda["A1"], ajuda["B1"] = "Coluna", "O que vai nela"
    for c in ("A1", "B1"):
        ajuda[c].font, ajuda[c].fill = BRANCO, FUNDO_CAB
    for i, (nome, _, texto_ajuda) in enumerate(colunas, start=2):
        ajuda.cell(row=i, column=1, value=nome).font = NEGRITO
        ajuda.cell(row=i, column=2, value=texto_ajuda).alignment = QUEBRA
    ajuda.column_dimensions["A"].width, ajuda.column_dimensions["B"].width = 16, 100


def aba_como_preencher(livro: Workbook) -> None:
    aba = livro.create_sheet("Como preencher", 0)
    aba.column_dimensions["A"].width = 34
    aba.column_dimensions["B"].width = 62
    aba.column_dimensions["C"].width = 46
    aba.column_dimensions["D"].width = 46
    linha = 1

    def escreve(texto, fonte=None, mesclar=True):
        nonlocal linha
        c = aba.cell(row=linha, column=1, value=texto)
        c.alignment = QUEBRA
        if fonte:
            c.font = fonte
        if mesclar:
            aba.merge_cells(start_row=linha, start_column=1, end_row=linha, end_column=4)
            aba.row_dimensions[linha].height = max(18, 15 * (len(texto) // 160 + 1))
        linha += 1

    escreve("Relatos para treinar a IA · Ponte Social", TITULO)
    escreve("Resumo do docs/guia_rotulagem.md. Em caso de dúvida, o guia vale mais que este resumo.")
    linha += 1
    escreve("Como preencher", NEGRITO)
    for passo in [
        "1. Escreva cada relato numa linha da aba Relatos, como a pessoa mandaria no WhatsApp: com gíria, erro de "
        "digitação, sem acento, frase curta ou desabafo longo. É assim que o bot recebe, e é isso que a IA precisa aprender.",
        f"2. Meta desta rodada: {META} relatos por necessidade. A aba Contagem mostra quantos faltam.",
        "3. Varie de verdade: pessoas diferentes (mãe solo, idoso, jovem, homem, migrante), jeitos diferentes de contar, "
        "palavras diferentes. Trocar uma palavra de um relato que já existe NÃO conta como relato novo: a IA decora e a "
        "nota fica falsa (foi o que aconteceu com o arquivo antigo: 240 linhas, só 84 frases diferentes).",
        "4. Escolha a necessidade principal na lista da coluna categoria. Na dúvida entre duas, escolha uma, ponha a "
        "outra em secundarias e explique em observacao.",
        "5. Linha pintada de vermelho = relato sem categoria ou repetido nesta planilha. Corrija antes de importar.",
        "6. Para importar: no painel, menu ☰ › Classificação › Dados de treino › Importar, e escolha este arquivo. "
        "O sistema anonimiza de novo, recusa repetidos e recusa frases do teste fixo, e mostra o motivo de cada recusa.",
    ]:
        escreve(passo)
    linha += 1
    escreve("Nunca coloque dado que identifique alguém", NEGRITO)
    for regra in [
        "Nome → [NOME] · CPF, RG, NIS → [DOCUMENTO] · telefone → [TELEFONE] · endereço → [ENDERECO] · e-mail → [EMAIL] · "
        "escola ou empresa que identifique → [LOCAL].",
        "Bairro e cidade podem ficar, EXCETO em relato de violência: aí troque o bairro por [BAIRRO].",
        "Relato de pessoa real (origem cras_real) só entra com o termo de consentimento assinado "
        "(docs/termo_coleta_e_consentimento.md) e depois da aprovação do Comitê de Ética.",
        "Não copie frases de data/relatos_teste_informais.json: elas medem a IA e não podem ir para o treino.",
    ]:
        escreve("• " + regra)
    linha += 1
    escreve("Regras para casos difíceis", NEGRITO)
    for regra in [
        "Violência vence tudo: qualquer sinal de violência torna Violência ou ameaça a principal.",
        "Mais de uma necessidade: a principal é a mais urgente (comida hoje > documento) ou a que a pessoa pede.",
        "Pedido explícito vence contexto: 'estou desempregada e quero um curso' → Trabalho e cursos.",
        "Não deduza além do texto: não imagine o que a pessoa não contou.",
    ]:
        escreve("• " + regra)
    linha += 1

    for i, cab in enumerate(["Necessidade", "É", "Não é", "Exemplo"], start=1):
        c = aba.cell(row=linha, column=i, value=cab)
        c.font, c.fill = BRANCO, FUNDO_CAB
    linha += 1
    for nome, _, e, nao_e, exemplo in CATEGORIAS:
        for i, valor in enumerate([nome, e, nao_e, f'"{exemplo}"'], start=1):
            c = aba.cell(row=linha, column=i, value=valor)
            c.alignment, c.border = QUEBRA, FINA
        aba.cell(row=linha, column=1).font = NEGRITO
        aba.row_dimensions[linha].height = 64
        linha += 1


def aba_contagem(livro: Workbook) -> None:
    aba = livro.create_sheet("Contagem")
    for i, cab in enumerate(["Necessidade", "Na planilha", "Meta", "Faltam"], start=1):
        c = aba.cell(row=1, column=i, value=cab)
        c.font, c.fill = BRANCO, FUNDO_CAB
    for i, (nome, *_rest) in enumerate(CATEGORIAS, start=2):
        aba.cell(row=i, column=1, value=nome).font = NEGRITO
        aba.cell(row=i, column=2, value=f'=COUNTIF(Relatos!$B$2:$B${LINHAS + 1},A{i})')
        aba.cell(row=i, column=3, value=META)
        aba.cell(row=i, column=4, value=f"=MAX(0,C{i}-B{i})")
        if i % 2:
            for col in range(1, 5):
                aba.cell(row=i, column=col).fill = FUNDO_CLARO
    total = len(CATEGORIAS) + 2
    aba.cell(row=total, column=1, value="Total").font = NEGRITO
    for col, letra in ((2, "B"), (3, "C"), (4, "D")):
        aba.cell(row=total, column=col, value=f"=SUM({letra}2:{letra}{total - 1})").font = NEGRITO
    aba.column_dimensions["A"].width = 34
    for letra in "BCD":
        aba.column_dimensions[letra].width = 14


def aba_listas(livro: Workbook) -> None:
    aba = livro.create_sheet("Listas")
    aba["A1"], aba["B1"], aba["C1"] = "Necessidade", "Código no sistema", "Origem"
    for i, (nome, codigo, *_rest) in enumerate(CATEGORIAS, start=2):
        aba.cell(row=i, column=1, value=nome)
        aba.cell(row=i, column=2, value=codigo)
    for i, origem in enumerate(ORIGENS, start=2):
        aba.cell(row=i, column=3, value=origem)
    aba.sheet_state = "hidden"


def main() -> None:
    livro = Workbook()
    aba_relatos(livro)
    aba_como_preencher(livro)
    aba_contagem(livro)
    aba_listas(livro)
    livro.active = livro.sheetnames.index("Como preencher")
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    livro.save(SAIDA)
    print(f"Gerado: {SAIDA}")


if __name__ == "__main__":
    main()
