"""
Carrega na Base de conhecimento os documentos oficiais de data/base_conhecimento (lista em fontes.json).
Pula os que já existem (pelo título) e gera os vetores no ritmo do Gemini gratuito: 50 trechos por minuto
(mandando tudo de uma vez a API responde 429 e os trechos ficam só com a busca por palavras).

    .venv/Scripts/python scripts/carregar_base_conhecimento.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
os.chdir(RAIZ / "backend")  # as configurações leem o .env da pasta atual

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import DocumentoBase, TrechoDocumento  # noqa: E402
from app.services.rag import documentos as base  # noqa: E402

PASTA = RAIZ / "data" / "base_conhecimento"
LOTE, PAUSA = 50, 65
AUTOR = "carga inicial (scripts/carregar_base_conhecimento.py)"


async def carregar_documentos() -> None:
    fontes = json.loads((PASTA / "fontes.json").read_text(encoding="utf-8"))
    async with SessionLocal() as s:
        existentes = {d.titulo for d in (await s.execute(select(DocumentoBase))).scalars()}
    for d in fontes["documentos"]:
        if d["titulo"] in existentes:
            print(f"já existe: {d['titulo']}")
            continue
        fonte = f"{d['url']} (consultado em {fontes['consultado_em']})"
        async with SessionLocal() as s:
            # Sem chave do Gemini (ou com o limite estourado) o documento entra igual, só com a busca por palavras
            doc = await base.criar(s, (PASTA / d["arquivo"]).read_bytes(), d["arquivo"], d["titulo"], fonte, d["tags"], AUTOR)
            print(f"carregado: {doc.titulo} ({len(await base.trechos_de(s, doc.id))} trechos)")


async def completar_vetores() -> None:
    if not settings.GEMINI_API_KEY:
        print("Sem GEMINI_API_KEY no backend/.env: a base funciona só com a busca por palavras.")
        return
    recusas = 0
    while True:
        async with SessionLocal() as s:
            # Vetor vazio fica gravado como null do JSON, que o filtro IS NULL do SQL não enxerga: confere aqui
            faltam = [t for t in (await s.execute(select(TrechoDocumento))).scalars() if not t.embedding]
            if not faltam:
                print("Todos os trechos têm vetor.")
                return
            print(f"Gerando vetores: faltam {len(faltam)}...", flush=True)
            ok = await base.vetorizar_trechos(faltam[:LOTE])
            await s.commit()
        recusas = 0 if ok else recusas + 1
        if recusas >= 3:
            print("O Gemini recusou 3 vezes seguidas (talvez o limite do dia). Rode de novo mais tarde: continua de onde parou.")
            return
        await asyncio.sleep(PAUSA)


async def main() -> None:
    await init_db()  # banco novo: cria as tabelas
    await carregar_documentos()
    await completar_vetores()


if __name__ == "__main__":
    asyncio.run(main())
