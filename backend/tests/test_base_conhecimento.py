"""Base de conhecimento: corte em trechos pela estrutura, envio de arquivos, edição de trechos e busca."""
import io
import uuid

from docx import Document
from fastapi.testclient import TestClient

from app.main import app
from app.services.rag import documentos as base
from conftest import autenticar

LEI = """LEI MUNICIPAL DO ALUGUEL SOCIAL

Art. 1º Fica instituído o Aluguel Social para famílias em situação de vulnerabilidade que perderam a moradia por enchente, desabamento ou despejo judicial.

Art. 2º Têm direito as famílias que atendam a todos os requisitos:
I - renda familiar per capita de até meio salário mínimo;
II - inscrição atualizada no Cadastro Único há pelo menos seis meses;
III - laudo da Defesa Civil ou decisão judicial que comprove a perda da moradia.

Art. 3º O valor mensal é de R$ 500,00, pago por até doze meses, podendo ser prorrogado uma vez mediante parecer da equipe técnica do CRAS.

Tabela de documentos
Documento | Quem apresenta | Observação
RG ou CNH | responsável familiar | original e cópia
Comprovante de residência anterior | responsável familiar | conta de luz ou água

Atendimento: CRAS Norte, telefone (62) 3902-1234. Exemplo de ficha: CPF 123.456.789-09.
"""


def _vetor_falso(textos, consulta=False):
    """Vetor de 3 posições pelo assunto: moradia, renda, documento (para testar a busca sem chamar o Gemini)."""
    async def f():
        saida = []
        for t in textos:
            t = t.lower()
            saida.append([1.0 if ("aluguel" in t or "moradia" in t or "casa" in t) else 0.1,
                          1.0 if ("renda" in t or "salário" in t or "dinheiro" in t) else 0.1,
                          1.0 if ("rg" in t or "documento" in t) else 0.1])
        return saida
    return f()


def test_corte_respeita_titulo_lista_e_tabela():
    trechos = base.fatiar([(1, LEI)])
    textos = [t["conteudo"] for t in trechos]
    # a lista do art. 2º e a tabela ficam inteiras num trecho só
    assert sum("I - renda familiar" in t and "III - laudo" in t for t in textos) == 1
    assert sum("RG ou CNH" in t and "Comprovante de residência" in t for t in textos) == 1
    # nenhum trecho termina no meio de uma frase do art. 3º
    assert all(not t.rstrip().endswith("podendo ser") for t in textos)
    assert all(t["secao"] for t in trechos[1:])
    # artigo é conteúdo, não título: a seção leva só o número ("Art. 2º"), nunca a frase inteira
    secoes = [t["secao"] for t in trechos]
    assert any(s.endswith("Art. 2º") for s in secoes) and all("Têm direito" not in s for s in secoes)


def test_enviar_editar_e_buscar(monkeypatch):
    monkeypatch.setattr(base, "vetorizar", lambda textos, consulta=False: _vetor_falso(textos, consulta))
    with TestClient(app) as client:
        autenticar(client)
        assert client.post("/api/v1/base/documentos", files={"arquivo": ("x.exe", io.BytesIO(b"MZ..."), "application/octet-stream")}).status_code == 422

        r = client.post("/api/v1/base/documentos", data={"titulo": f"Lei do Aluguel Social {uuid.uuid4().hex[:4]}", "fonte": "Diário Oficial", "tags": "#AluguelSocial, moradia"},
                        files={"arquivo": ("lei.txt", io.BytesIO(LEI.encode("utf-8")), "text/plain")})
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["trechos"] >= 2 and doc["com_vetor"] == doc["trechos"] and doc["tags"] == ["AluguelSocial", "moradia"]

        aberto = client.get(f"/api/v1/base/documentos/{doc['id']}").json()
        assert "[cpf]" in aberto["texto"] and "123.456.789-09" not in aberto["texto"] and "(62) 3902-1234" in aberto["texto"]

        # editar o valor da lei: o trecho é marcado como editado e ganha vetor novo
        trecho = next(t for t in aberto["lista_trechos"] if "R$ 500,00" in t["conteudo"])
        r = client.patch(f"/api/v1/base/trechos/{trecho['id']}", json={"conteudo": trecho["conteudo"].replace("R$ 500,00", "R$ 600,00")})
        assert r.status_code == 200 and r.json()["editado_manualmente"] and r.json()["tem_vetor"]

        # dividir e juntar de novo
        n = len(aberto["lista_trechos"])
        partes = client.post(f"/api/v1/base/trechos/{trecho['id']}/dividir", json={"posicao": 40}).json()
        assert len(partes) == 2 and len(client.get(f"/api/v1/base/documentos/{doc['id']}").json()["lista_trechos"]) == n + 1
        assert client.post(f"/api/v1/base/trechos/{partes[0]['id']}/juntar").status_code == 200
        assert len(client.get(f"/api/v1/base/documentos/{doc['id']}").json()["lista_trechos"]) == n

        busca = client.post("/api/v1/base/buscar", json={"pergunta": "qual o valor do aluguel social?"}).json()
        assert busca["modo"] == "palavras e significado"
        assert any("R$ 600,00" in x["trecho"]["conteudo"] for x in busca["resultados"][:2])
        assert all(0 <= x["nota"] <= 1 for x in busca["resultados"])

        assert client.delete(f"/api/v1/base/documentos/{doc['id']}").status_code == 200
        assert client.get(f"/api/v1/base/documentos/{doc['id']}").status_code == 404


def test_docx_e_busca_so_por_palavras_sem_chave():
    arquivo = io.BytesIO()
    d = Document()
    d.add_heading("Cesta básica emergencial", level=1)
    d.add_paragraph("A cesta básica é entregue pelo CRAS às famílias em insegurança alimentar, após atendimento com a equipe técnica.")
    tabela = d.add_table(rows=2, cols=2)
    tabela.rows[0].cells[0].text, tabela.rows[0].cells[1].text = "Item", "Quantidade"
    tabela.rows[1].cells[0].text, tabela.rows[1].cells[1].text = "Arroz", "5 kg"
    d.save(arquivo)
    arquivo.seek(0)
    with TestClient(app) as client:
        autenticar(client)
        r = client.post("/api/v1/base/documentos", data={"titulo": f"Cesta {uuid.uuid4().hex[:4]}"},
                        files={"arquivo": ("cesta.docx", arquivo, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["tipo"] == "docx" and doc["com_vetor"] == 0  # sem chave do Gemini nos testes
        busca = client.post("/api/v1/base/buscar", json={"pergunta": "como pegar cesta basica"}).json()
        assert busca["modo"] == "só palavras" and "cesta" in busca["resultados"][0]["trecho"]["conteudo"].lower()
        assert client.post(f"/api/v1/base/documentos/{doc['id']}/reindexar").status_code == 503
        client.delete(f"/api/v1/base/documentos/{doc['id']}")


def test_busca_com_reescrita_e_reordenacao(monkeypatch):
    from app.services.rag import consulta

    async def reescrever(pergunta):
        return {"consulta": "perda da moradia por enchente, auxílio para aluguel", "termos": ["moradia", "aluguel"]}

    async def reordenar(pergunta, candidatos):
        # a IA prefere o trecho do valor (art. 3º) a todos os outros
        return {c["id"]: (1.0 if "R$ 500,00" in c["texto"] else 0.1) for c in candidatos}

    monkeypatch.setattr(consulta, "reescrever", reescrever)
    monkeypatch.setattr(consulta, "reordenar", reordenar)
    with TestClient(app) as client:
        autenticar(client)
        doc = client.post("/api/v1/base/documentos", data={"titulo": f"Aluguel {uuid.uuid4().hex[:4]}"},
                          files={"arquivo": ("lei.txt", io.BytesIO(LEI.encode("utf-8")), "text/plain")}).json()
        r = client.post("/api/v1/base/buscar", json={"pergunta": "perdi a casa na chuva, tem ajuda?"}).json()
        assert r["reescrita"]["consulta"].startswith("perda da moradia") and r["reordenado"] is True
        assert "R$ 500,00" in r["resultados"][0]["trecho"]["conteudo"] and r["resultados"][0]["nota_ia"] == 1.0

        # sem as etapas de IA: só a busca, e a resposta diz isso
        r = client.post("/api/v1/base/buscar", json={"pergunta": "perdi a casa na chuva, tem ajuda?", "reescrever": False, "reordenar": False}).json()
        assert r["reescrita"] is None and r["reordenado"] is False and all(x["nota_ia"] is None for x in r["resultados"])

        # IA fora do ar na reordenação: cai para a ordem da busca, sem quebrar
        async def falha(pergunta, candidatos):
            return None
        monkeypatch.setattr(consulta, "reordenar", falha)
        r = client.post("/api/v1/base/buscar", json={"pergunta": "valor do aluguel social"}).json()
        assert r["reordenado"] is False and r["resultados"]
        client.delete(f"/api/v1/base/documentos/{doc['id']}")


def test_leitura_das_notas_da_ia(monkeypatch):
    import asyncio

    from app.services.rag import consulta

    async def gemini(prompt, texto, schema, timeout=15.0):
        return {"notas": [{"id": "a", "nota": 15}, {"id": "b", "nota": -2}, {"id": "inventado", "nota": 9}, {"id": "c"}]}

    monkeypatch.setattr(consulta, "_gemini_json", gemini)
    notas = asyncio.run(consulta.reordenar("p", [{"id": "a", "texto": "x"}, {"id": "b", "texto": "y"}, {"id": "c", "texto": "z"}]))
    assert notas == {"a": 1.0, "b": 0.0}  # limitado a 0..10, id inventado e item sem nota ignorados
