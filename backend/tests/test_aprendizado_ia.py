"""Correção da necessidade pela equipe, retreino que só troca o modelo se não piorar, e comparação LLM x modelo local."""
import json
import uuid

from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.services.ml import comparacao_ia, retreino
from conftest import autenticar
from test_unidades import conversa, telefone

FILA = "/api/v1/triagem/fila"


def _caso(client, relato="perdi minha identidade e preciso tirar outra"):
    antes = {t["id"] for t in client.get(FILA).json()}
    conversa(client, telefone(), "oi", "1", relato, "1", "1")
    return next(t for t in client.get(FILA).json() if t["id"] not in antes)


def test_equipe_corrige_a_necessidade_e_o_caso_vira_exemplo():
    with TestClient(app) as client:
        autenticar(client)
        caso = _caso(client)
        assert client.patch(f"/api/v1/triagem/{caso['id']}/categoria", json={"categoria": "inventada"}).status_code == 422
        r = client.patch(f"/api/v1/triagem/{caso['id']}/categoria", json={"categoria": "moradia"}).json()["triagem"]
        assert r["categoria"] == "moradia" and r["categoria_modelo"] == "documentacao" and r["corrigida_por"]
        assert r["titulo_encaminhamento"] != caso["titulo_encaminhamento"]

        r = client.patch(f"/api/v1/triagem/{caso['id']}/categoria", json={"categoria": "violencia_protecao"}).json()["triagem"]
        assert r["prioridade"] == "URGENTE_VIOLENCIA" and r["status"] == "URGENTE_CREAS"

        async def reais():
            async with abrir_sessao() as session:
                return await retreino.exemplos_reais(session)
        exemplos = client.portal.call(reais)
        assert any(e["texto"] == caso["relato_original"] and e["categoria"] == "violencia_protecao" and e["fonte"] == "equipe"
                   for e in exemplos)
        info = client.get("/api/v1/ml/aprendizado").json()
        assert info["exemplos_reais"] >= 1 and info["por_fonte"]["equipe"] >= 1


def _relatorio(f1, recall, reais=0):
    s = {"f1_macro": f1, "acuracia": f1, "recall_violencia": recall}
    return {"modelo_final": {"nome": "Regressão Logística", "teste_sistema_completo": s}, "dataset_size": 84 + reais,
            "exemplos_reais": reais}


def test_retreino_so_troca_o_modelo_se_nao_piorar(monkeypatch, tmp_path):
    modelo, relatorio, historico = tmp_path / "modelo.joblib", tmp_path / "relatorio.json", tmp_path / "historico.json"
    modelo.write_text("modelo atual")
    relatorio.write_text(json.dumps(_relatorio(0.70, 0.60)))
    monkeypatch.setattr(retreino, "MODEL_OUTPUT", str(modelo))
    monkeypatch.setattr(retreino, "REPORT_OUTPUT", str(relatorio))
    monkeypatch.setattr(retreino, "HISTORICO", str(historico))
    proximo = {}

    def treino_falso(dataset, saida_modelo, saida_relatorio, exemplos_reais=None, n_jobs=-1):
        r = _relatorio(*proximo["metricas"], reais=len(exemplos_reais or []))
        open(saida_modelo, "w").write("modelo novo")
        open(saida_relatorio, "w").write(json.dumps(r))
        return r
    monkeypatch.setattr(retreino, "train_and_evaluate", treino_falso)

    with TestClient(app) as client:
        autenticar(client)
        proximo["metricas"] = (0.80, 0.50)  # F1 sobe, mas reconhece menos violência: não troca
        r = client.post("/api/v1/ml/retrain").json()
        assert not r["trocou"] and "violência" in r["motivo"] and modelo.read_text() == "modelo atual"

        proximo["metricas"] = (0.695, 0.60)  # F1 cai menos que a tolerância e violência igual: troca
        r = client.post("/api/v1/ml/retrain").json()
        assert r["trocou"] and modelo.read_text() == "modelo novo"
        assert json.loads(relatorio.read_text())["modelo_final"]["teste_sistema_completo"]["f1_macro"] == 0.695

        hist = client.get("/api/v1/ml/aprendizado").json()["historico"]
        assert len(hist) == 2 and hist[0]["trocou"] and not hist[1]["trocou"]  # mais recente primeiro


def test_comparacao_llm_x_modelo_local_no_mesmo_teste(monkeypatch, tmp_path):
    monkeypatch.setattr(comparacao_ia, "SAIDA", str(tmp_path / "comparacao.json"))
    monkeypatch.setattr(comparacao_ia.settings, "GEMINI_API_KEY", "chave-de-teste")
    teste = comparacao_ia.carregar_teste()
    gabarito = dict(zip(teste["texto"], teste["categoria"]))

    async def gemini_falso(client, texto):  # acerta tudo, menos violência (para testar a rede de segurança)
        certo = gabarito[texto]
        return {"categoria": "renda_beneficio" if certo == "violencia_protecao" else certo, "segundos": 0.4, "tokens": 300}
    monkeypatch.setattr(comparacao_ia, "_gemini", gemini_falso)
    monkeypatch.setattr(comparacao_ia, "INTERVALO_S", 0)

    with TestClient(app) as client:
        autenticar(client)
        r = client.portal.call(comparacao_ia.comparar)
        a = r["abordagens"]
        assert set(a) == {"modelo_local", "llm", "hibrido"} and len(r["casos"]) == len(teste)
        assert a["llm"]["recall_violencia"] == 0.0 and a["llm"]["tokens_medios"] == 300
        # o híbrido recupera a violência que o modelo local reconhece
        assert a["hibrido"]["recall_violencia"] >= a["modelo_local"]["recall_violencia"]
        assert all(c["hibrido"] == "violencia_protecao" for c in r["casos"] if c["modelo_local"] == "violencia_protecao")
        assert client.get("/api/v1/ml/comparacao").json()["resultado"]["timestamp"] == r["timestamp"]


def test_mesmo_relato_vale_a_correcao_da_equipe():
    """Relato repetido: a pessoa confirmou um caso como documentos, a equipe corrigiu outro igual para trabalho e cursos.
    O exemplo de treino fica com a correção da equipe, não com o caso que chegou primeiro."""
    relato = f"perdi tudo na enchente e nao sei pra onde ir {uuid.uuid4().hex[:6]}"
    with TestClient(app) as client:
        autenticar(client)
        _caso(client, relato)  # confirmado pela pessoa, sem correção
        corrigido = _caso(client, relato)
        client.patch(f"/api/v1/triagem/{corrigido['id']}/categoria", json={"categoria": "trabalho_renda"})

        async def reais():
            async with abrir_sessao() as session:
                return await retreino.exemplos_reais(session)
        achados = [e for e in client.portal.call(reais) if e["texto"].startswith(relato[:30])]
        assert len(achados) == 1 and achados[0]["categoria"] == "trabalho_renda" and achados[0]["fonte"] == "equipe"
