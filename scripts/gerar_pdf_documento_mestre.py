import os
import subprocess
import markdown

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
md_path = os.path.join(base_dir, "documentacao", "Ponte_Social_Documento_Mestre.md")
html_path = os.path.join(base_dir, "documentacao", "Ponte_Social_Documento_Mestre.html")
pdf_path = os.path.join(base_dir, "documentacao", "Ponte_Social_Documento_Mestre.pdf")

with open(md_path, "r", encoding="utf-8") as f:
    text = f.read()

# Converte markdown com tabelas, toc e fenced code
html_body = markdown.markdown(text, extensions=["tables", "fenced_code", "toc"])

html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ponte Social · Documento Mestre de Engenharia, Produto e Gestão Ágil</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    @page {{
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right {{
        content: counter(page);
      }}
    }}
    
    * {{
      box-sizing: border-box;
    }}
    
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }}
    
    .cover {{
      text-align: center;
      padding-top: 40px;
      padding-bottom: 60px;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 40px;
    }}
    
    h1 {{
      font-size: 24pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
      margin-top: 0;
      margin-bottom: 8px;
    }}
    
    h2 {{
      font-size: 16pt;
      font-weight: 700;
      color: #1e293b;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 32px;
      margin-bottom: 16px;
      page-break-after: avoid;
    }}
    
    /* Quebra de página antes das grandes partes */
    h1[id^="parte-"], h2[id^="parte-"] {{
      page-break-before: always;
      margin-top: 20px;
    }}
    
    h3 {{
      font-size: 13pt;
      font-weight: 700;
      color: #334155;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }}
    
    h4 {{
      font-size: 11pt;
      font-weight: 700;
      color: #475569;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}
    
    p, li {{
      color: #334155;
    }}
    
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }}
    
    th, td {{
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }}
    
    th {{
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
    }}
    
    tr:nth-child(even) {{
      background-color: #f8fafc;
    }}
    
    blockquote {{
      border-left: 4px solid #ea580c;
      background-color: #fff7ed;
      padding: 10px 16px;
      margin: 16px 0;
      font-style: italic;
      color: #9a3412;
      border-radius: 0 6px 6px 0;
    }}
    
    pre, code {{
      font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
      font-size: 8.5pt;
    }}
    
    pre {{
      background-color: #0f172a;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 6px;
      border: 1px solid #334155;
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      overflow: hidden !important;
      page-break-inside: avoid;
      margin: 14px 0;
      line-height: 1.45;
    }}
    
    code {{
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }}
    
    pre code {{
      background: none;
      color: inherit;
      padding: 0;
      border: none;
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
    }}
    
    hr {{
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 28px 0;
    }}
    
    ul, ol {{
      padding-left: 24px;
      margin-bottom: 16px;
    }}
    
    li {{
      margin-bottom: 4px;
    }}
    
    .badge {{
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
    }}
  </style>
</head>
<body>
  {html_body}
</body>
</html>
"""

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"[OK] HTML gerado: {html_path}")

# Tenta converter para PDF via Edge ou Chrome headless
browsers = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe"
]

browser_exe = None
for b in browsers:
    if os.path.exists(b):
        browser_exe = b
        break

if browser_exe:
    print(f"Gerando PDF com {os.path.basename(browser_exe)}...")
    cmd = [
        browser_exe,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        html_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and os.path.exists(pdf_path):
        size_kb = os.path.getsize(pdf_path) // 1024
        print(f"[SUCESSO] PDF gerado: {pdf_path} ({size_kb} KB)")
    else:
        print("[AVISO] Falha ao gerar PDF:", res.stderr)
else:
    print("[AVISO] Nenhum navegador encontrado para impressão direta.")
