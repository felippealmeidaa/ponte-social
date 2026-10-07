"""Dados de treino: exemplos da equipe com anonimização, travas (teste fixo, repetidos), importação, exportação e retreino."""
import io
import json
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services.ml import exemplos, retreino
from conftest import autenticar


def _frase(base: str) -> str:
    return f"{base} {uuid.uuid4().hex[:6]}"  # frase única a cada execução (o banco de teste é compartilhado)


def test_criar_editar_e_travas_dos_exemplos():
    teste = json.load(open(exemplos.TEST_PATH, encoding="utf-8"))["relatos"][0]["texto"]
    with TestClient(app) as client:
        autenticar(client)
        r = client.post("/api/v1/ml/exemplos", json={"texto": _frase("perdi tudo na enchente meu cpf 123.456.789-09 casa"), "categoria": "moradia"})
        assert r.status_code == 201, r.text
        criado = r.json()
        assert "[cpf]" in criado["texto"] and "123.456" not in criado["texto"] and criado["origem"] == "manual"

        assert client.post("/api/v1/ml/exemplos", json={"texto": criado["texto"], "categoria": "moradia"}).status_code == 422
        assert "teste fixo" in client.post("/api/v1/ml/exemplos", json={"texto": teste, "categoria": "renda_beneficio"}).json()["detail"]
        assert client.post("/api/v1/ml/exemplos", json={"texto": _frase("frase qualquer valida"), "categoria": "inventada"}).status_code == 422

        r = client.patch(f"/api/v1/ml/exemplos/{criado['id']}", json={"categoria": "alimentacao", "ativo": False})
        assert r.status_code == 200 and r.json()["categoria"] == "alimentacao" and r.json()["ativo"] is False

        lista = client.get("/api/v1/ml/exemplos").json()
        assert any(e["id"] == criado["id"] for e in lista["equipe"])
        assert lista["totais"]["simulados"] > 0 and lista["totais"]["teste_fixo"] > 0
        assert set(lista["por_categoria"]) == set(lista["categorias"])

        assert client.delete(f"/api/v1/ml/exemplos/{criado['id']}").status_code == 200
        assert not any(e["id"] == criado["id"] for e in client.get("/api/v1/ml/exemplos").json()["equipe"])


def test_importar_e_exportar_csv():
    boa = _frase("preciso de cesta basica pros meus filhos")
    csv_texto = f"texto;categoria\n{boa};alimentacao\n{boa};alimentacao\nfrase curta;moradia\n{_frase('quero tirar segunda via do rg')};nao_existe\n"
    with TestClient(app) as client:
        autenticar(client)
        r = client.post("/api/v1/ml/exemplos/importar", files={"arquivo": ("exemplos.csv", io.BytesIO(csv_texto.encode("utf-8")), "text/csv")})
        assert r.status_code == 200, r.text
        resultado = r.json()
        assert resultado["criados"] == 1 and resultado["total_recusados"] == 3
        assert {x["linha"] for x in resultado["recusados"]} == {3, 4, 5}

        sem_colunas = client.post("/api/v1/ml/exemplos/importar", files={"arquivo": ("x.csv", io.BytesIO(b"frase;tipo\na;b\n"), "text/csv")})
        assert sem_colunas.status_code == 422 and "texto" in sem_colunas.json()["detail"]

        planilha = client.get("/api/v1/ml/exemplos.csv?origem=equipe")
        assert planilha.status_code == 200 and "dados-de-treino-equipe.csv" in planilha.headers["content-disposition"]
        assert boa in planilha.content.decode("utf-8-sig")


def test_retreino_usa_os_exemplos_ativos_da_equipe(monkeypatch):
    ativo, pausado = _frase("meu aluguel venceu e vou ser despejada"), _frase("nao tenho onde morar com as criancas")
    recebidos = {}

    def treinar_falso(reais, usuario):
        recebidos["reais"] = reais
        return {"trocou": False}

    monkeypatch.setattr(retreino, "_treinar", treinar_falso)
    with TestClient(app) as client:
        autenticar(client)
        client.post("/api/v1/ml/exemplos", json={"texto": ativo, "categoria": "moradia"})
        p = client.post("/api/v1/ml/exemplos", json={"texto": pausado, "categoria": "moradia"}).json()
        client.patch(f"/api/v1/ml/exemplos/{p['id']}", json={"ativo": False})
        assert client.post("/api/v1/ml/retrain").status_code == 200

    textos = {e["texto"]: e["fonte"] for e in recebidos["reais"]}
    assert textos.get(ativo) == "exemplos" and pausado not in textos
