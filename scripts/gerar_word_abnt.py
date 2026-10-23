import os
import re
import docx
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_formatted_runs(paragraph, text, base_font_size=Pt(12), is_italic_base=False):
    # Regex para capturar **bold**, *italic*, e `code`
    tokens = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', text)
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**') and len(token) >= 4:
            run = paragraph.add_run(token[2:-2])
            run.font.name = 'Arial'
            run.font.size = base_font_size
            run.font.bold = True
            run.font.italic = is_italic_base
            run.font.color.rgb = RGBColor(0, 0, 0)
        elif token.startswith('*') and token.endswith('*') and len(token) >= 2 and not token.startswith('**'):
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Arial'
            run.font.size = base_font_size
            run.font.italic = True
            run.font.color.rgb = RGBColor(0, 0, 0)
        elif token.startswith('`') and token.endswith('`') and len(token) >= 2:
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(base_font_size.pt * 0.9)
            run.font.color.rgb = RGBColor(40, 40, 40)
        else:
            run = paragraph.add_run(token)
            run.font.name = 'Arial'
            run.font.size = base_font_size
            run.font.italic = is_italic_base
            run.font.color.rgb = RGBColor(0, 0, 0)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    md_path = os.path.join(base_dir, "documentacao", "Ponte_Social_Documento_Mestre.md")
    docx_path = os.path.join(base_dir, "documentacao", "Ponte_Social_Documento_Mestre.docx")

    doc = docx.Document()

    # 1. Configurar margens ABNT (Superior 3cm, Esquerda 3cm, Inferior 2cm, Direita 2cm)
    for section in doc.sections:
        section.top_margin = Cm(3.0)
        section.left_margin = Cm(3.0)
        section.bottom_margin = Cm(2.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # 2. Configurar Estilo Normal
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Arial'
    style_normal.font.size = Pt(12)
    style_normal.font.color.rgb = RGBColor(0, 0, 0)

    # =========================================================================
    # CAPA ABNT (NBR 14724)
    # =========================================================================
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_inst.paragraph_format.line_spacing = 1.5
    p_inst.paragraph_format.space_after = Pt(120)
    r1 = p_inst.add_run("CENTRO UNIVERSITÁRIO DE ANÁPOLIS — UNIEVANGÉLICA\nFACULDADE DE INTELIGÊNCIA ARTIFICIAL E ENGENHARIA DE SOFTWARE\nCURSO DE BACHARELADO EM INTELIGÊNCIA ARTIFICIAL")
    r1.font.name = 'Arial'
    r1.font.size = Pt(12)
    r1.font.bold = True

    p_autores = doc.add_paragraph()
    p_autores.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_autores.paragraph_format.line_spacing = 1.5
    p_autores.paragraph_format.space_after = Pt(140)
    r_aut = p_autores.add_run("FELIPPE ALMEIDA\nGUILHERME HENRIQUE CARVALHAL\nJOÃO VICTOR DOMINGUES\nPAULA TOMAZZELLI")
    r_aut.font.name = 'Arial'
    r_aut.font.size = Pt(12)
    r_aut.font.bold = True

    p_titulo = doc.add_paragraph()
    p_titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_titulo.paragraph_format.line_spacing = 1.5
    p_titulo.paragraph_format.space_after = Pt(180)
    r_tit = p_titulo.add_run("PONTE SOCIAL: SISTEMA INTELIGENTE DE ENCAMINHAMENTO SOCIAL\n")
    r_tit.font.name = 'Arial'
    r_tit.font.size = Pt(14)
    r_tit.font.bold = True
    r_sub = p_titulo.add_run("Documentação Mestre de Engenharia de Software, Requisitos, MLOps e Gestão Ágil")
    r_sub.font.name = 'Arial'
    r_sub.font.size = Pt(12)

    p_local = doc.add_paragraph()
    p_local.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_local.paragraph_format.line_spacing = 1.0
    r_loc = p_local.add_run("ANÁPOLIS - GO\n2026")
    r_loc.font.name = 'Arial'
    r_loc.font.size = Pt(12)
    r_loc.font.bold = True

    doc.add_page_break()

    # =========================================================================
    # FOLHA DE ROSTO ABNT
    # =========================================================================
    p_aut2 = doc.add_paragraph()
    p_aut2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_aut2.paragraph_format.line_spacing = 1.5
    p_aut2.paragraph_format.space_after = Pt(120)
    r_aut2 = p_aut2.add_run("FELIPPE ALMEIDA\nGUILHERME HENRIQUE CARVALHAL\nJOÃO VICTOR DOMINGUES\nPAULA TOMAZZELLI")
    r_aut2.font.name = 'Arial'
    r_aut2.font.size = Pt(12)
    r_aut2.font.bold = True

    p_tit2 = doc.add_paragraph()
    p_tit2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_tit2.paragraph_format.line_spacing = 1.5
    p_tit2.paragraph_format.space_after = Pt(80)
    r_tit2 = p_tit2.add_run("PONTE SOCIAL: SISTEMA INTELIGENTE DE ENCAMINHAMENTO SOCIAL\n")
    r_tit2.font.name = 'Arial'
    r_tit2.font.size = Pt(14)
    r_tit2.font.bold = True
    r_sub2 = p_tit2.add_run("Documentação Mestre de Engenharia de Software, Requisitos, MLOps e Gestão Ágil")
    r_sub2.font.name = 'Arial'
    r_sub2.font.size = Pt(12)

    p_natureza = doc.add_paragraph()
    p_natureza.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p_natureza.paragraph_format.left_indent = Cm(8.0)
    p_natureza.paragraph_format.line_spacing = 1.0
    p_natureza.paragraph_format.space_after = Pt(180)
    r_nat = p_natureza.add_run(
        "Trabalho acadêmico e técnico apresentado à Faculdade de Inteligência Artificial e "
        "Engenharia de Software do Centro Universitário de Anápolis (UniEVANGÉLICA) como "
        "requisito oficial de avaliação no Projeto Integrador do 3º Período de Inteligência Artificial (2026/2)."
    )
    r_nat.font.name = 'Arial'
    r_nat.font.size = Pt(10)

    p_local2 = doc.add_paragraph()
    p_local2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_local2.paragraph_format.line_spacing = 1.0
    r_loc2 = p_local2.add_run("ANÁPOLIS - GO\n2026")
    r_loc2.font.name = 'Arial'
    r_loc2.font.size = Pt(12)
    r_loc2.font.bold = True

    doc.add_page_break()

    # =========================================================================
    # LEITURA E PARSING DO MARKDOWN
    # =========================================================================
    with open(md_path, 'r', encoding='utf-8') as f:
        md_text = f.read()

    lines = md_text.splitlines()

    i = 0
    in_code_block = False
    code_lines = []
    in_table = False
    table_rows = []

    # Ignora cabeçalhos iniciais do MD que já estão na Capa / Folha de rosto
    # Começamos a processar do Sumário ou da Parte 1
    start_processing = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("## Sumário"):
            start_processing = True

        if not start_processing:
            i += 1
            continue

        # 1. Tratamento de blocos de código
        if stripped.startswith("```"):
            if in_code_block:
                # Fechamento do bloco de código
                code_text = "\n".join(code_lines)
                p_code = doc.add_paragraph()
                p_code.paragraph_format.line_spacing = 1.0
                p_code.paragraph_format.left_indent = Cm(1.0)
                p_code.paragraph_format.right_indent = Cm(1.0)
                p_code.paragraph_format.space_before = Pt(6)
                p_code.paragraph_format.space_after = Pt(6)
                run_c = p_code.add_run(code_text)
                run_c.font.name = 'Consolas'
                run_c.font.size = Pt(9.5)
                run_c.font.color.rgb = RGBColor(30, 41, 59)
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # 2. Tratamento de tabelas markdown
        if stripped.startswith("|") and stripped.endswith("|"):
            in_table = True
            # Ignora linha de separação (|:---|:---:|)
            if not re.match(r'^\|[\s:-]+\|$', stripped) and not set(stripped.replace('|', '').strip()).issubset({'-', ':', ' '}):
                row_cols = [c.strip() for c in stripped.split("|")[1:-1]]
                table_rows.append(row_cols)
            i += 1
            continue
        elif in_table:
            # Fim da tabela: renderiza na ABNT
            if table_rows:
                num_cols = max(len(r) for r in table_rows)
                docx_table = doc.add_table(rows=len(table_rows), cols=num_cols)
                docx_table.alignment = WD_TABLE_ALIGNMENT.CENTER
                docx_table.autofit = True

                for r_idx, row_data in enumerate(table_rows):
                    row = docx_table.rows[r_idx]
                    is_header = (r_idx == 0)
                    for c_idx, cell_value in enumerate(row_data):
                        if c_idx < len(row.cells):
                            cell = row.cells[c_idx]
                            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
                            p_cell = cell.paragraphs[0]
                            p_cell.paragraph_format.line_spacing = 1.0
                            p_cell.paragraph_format.space_after = Pt(2)
                            p_cell.paragraph_format.space_before = Pt(2)
                            p_cell.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            if is_header:
                                set_cell_background(cell, "F1F5F9")
                                add_formatted_runs(p_cell, cell_value, base_font_size=Pt(9.5))
                                for r in p_cell.runs:
                                    r.font.bold = True
                            else:
                                if r_idx % 2 == 1:
                                    set_cell_background(cell, "FAFAFA")
                                add_formatted_runs(p_cell, cell_value, base_font_size=Pt(9.0))
                p_spacer = doc.add_paragraph()
                p_spacer.paragraph_format.space_after = Pt(6)
            table_rows = []
            in_table = False

        # 3. Cabeçalhos de Seções ABNT
        if stripped.startswith("# "):
            header_text = stripped[2:].strip()
            # Quebra de página antes das grandes partes
            if "Parte " in header_text or "Sumário" in header_text:
                doc.add_page_break()
            p_h = doc.add_paragraph()
            p_h.paragraph_format.space_before = Pt(24)
            p_h.paragraph_format.space_after = Pt(12)
            p_h.paragraph_format.line_spacing = 1.5
            p_h.paragraph_format.keep_with_next = True
            r = p_h.add_run(header_text.upper())
            r.font.name = 'Arial'
            r.font.size = Pt(14)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0, 0, 0)
            i += 1
            continue

        if stripped.startswith("## "):
            header_text = stripped[3:].strip()
            if "Sumário" in header_text:
                p_h = doc.add_paragraph()
                p_h.paragraph_format.space_before = Pt(18)
                p_h.paragraph_format.space_after = Pt(12)
                p_h.paragraph_format.line_spacing = 1.5
                p_h.paragraph_format.keep_with_next = True
                r = p_h.add_run("SUMÁRIO")
                r.font.name = 'Arial'
                r.font.size = Pt(14)
                r.font.bold = True
                i += 1
                continue
            p_h = doc.add_paragraph()
            p_h.paragraph_format.space_before = Pt(16)
            p_h.paragraph_format.space_after = Pt(8)
            p_h.paragraph_format.line_spacing = 1.5
            p_h.paragraph_format.keep_with_next = True
            r = p_h.add_run(header_text)
            r.font.name = 'Arial'
            r.font.size = Pt(12)
            r.font.bold = True
            i += 1
            continue

        if stripped.startswith("### "):
            header_text = stripped[4:].strip()
            p_h = doc.add_paragraph()
            p_h.paragraph_format.space_before = Pt(14)
            p_h.paragraph_format.space_after = Pt(6)
            p_h.paragraph_format.line_spacing = 1.5
            p_h.paragraph_format.keep_with_next = True
            r = p_h.add_run(header_text)
            r.font.name = 'Arial'
            r.font.size = Pt(12)
            r.font.bold = True
            i += 1
            continue

        if stripped.startswith("#### "):
            header_text = stripped[5:].strip()
            p_h = doc.add_paragraph()
            p_h.paragraph_format.space_before = Pt(10)
            p_h.paragraph_format.space_after = Pt(4)
            p_h.paragraph_format.line_spacing = 1.5
            p_h.paragraph_format.keep_with_next = True
            r = p_h.add_run(header_text)
            r.font.name = 'Arial'
            r.font.size = Pt(11)
            r.font.bold = True
            r.font.italic = True
            i += 1
            continue

        # 4. Linhas divisórias (ignora no ABNT)
        if stripped == "---":
            i += 1
            continue

        # 5. Citações e Destaques (> citação ABNT recuo 4cm, fonte 10pt)
        if stripped.startswith(">"):
            quote_text = stripped.lstrip(">").strip()
            p_q = doc.add_paragraph()
            p_q.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p_q.paragraph_format.left_indent = Cm(4.0)
            p_q.paragraph_format.line_spacing = 1.0
            p_q.paragraph_format.space_before = Pt(6)
            p_q.paragraph_format.space_after = Pt(6)
            add_formatted_runs(p_q, quote_text, base_font_size=Pt(10), is_italic_base=True)
            i += 1
            continue

        # 6. Itens de lista
        if stripped.startswith(("- ", "• ", "* ")) and not stripped.startswith("**"):
            item_text = stripped[2:].strip()
            p_li = doc.add_paragraph()
            p_li.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p_li.paragraph_format.left_indent = Cm(1.25)
            p_li.paragraph_format.first_line_indent = Cm(-0.5)
            p_li.paragraph_format.line_spacing = 1.5
            p_li.paragraph_format.space_after = Pt(4)
            run_bullet = p_li.add_run("• ")
            run_bullet.font.bold = True
            add_formatted_runs(p_li, item_text, base_font_size=Pt(12))
            i += 1
            continue

        # 7. Itens numerados
        m_num = re.match(r'^(\d+)\.\s+(.*)$', stripped)
        if m_num:
            num = m_num.group(1)
            item_text = m_num.group(2)
            p_num = doc.add_paragraph()
            p_num.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p_num.paragraph_format.left_indent = Cm(1.25)
            p_num.paragraph_format.first_line_indent = Cm(-0.5)
            p_num.paragraph_format.line_spacing = 1.5
            p_num.paragraph_format.space_after = Pt(4)
            run_num = p_num.add_run(f"{num}. ")
            run_num.font.bold = True
            add_formatted_runs(p_num, item_text, base_font_size=Pt(12))
            i += 1
            continue

        # 8. Parágrafos comuns (Justificado, 1.5 entrelinhas, recuo de 1,25 cm na 1ª linha)
        if stripped:
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = Cm(1.25)
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(6)
            add_formatted_runs(p, stripped, base_font_size=Pt(12))

        i += 1

    # Salva o documento
    try:
        doc.save(docx_path)
        size_kb = os.path.getsize(docx_path) // 1024
        print(f"[SUCESSO] Documento Word ABNT gerado: {docx_path} ({size_kb} KB)")
    except PermissionError:
        doc_folder = os.path.dirname(docx_path)
        fallback_path = os.path.join(doc_folder, "Ponte_Social_Documento_Mestre_Atualizado.docx")
        doc.save(fallback_path)
        size_kb = os.path.getsize(fallback_path) // 1024
        print(f"[AVISO] O arquivo '{os.path.basename(docx_path)}' está atualmente aberto no Word.")
        print(f"[SUCESSO] Versão atualizada salva como: {fallback_path} ({size_kb} KB)")

if __name__ == "__main__":
    main()
