"""A IA lê o relato pelo sentido; sem ela (sem chave ou fora do ar), o fluxo segue com o modelo local."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.llm import entendimento
from conftest import autenticar
from test_unidades import conversa, telefone


@pytest.fixture
def ia(monkeypatch):
    """Troca a chamada ao Gemini por respostas fixas, escolhidas pelo texto."""
    respostas = {}

    async def falsa(texto):
        return respostas.get(texto)

    monkeypatch.setattr(entendimento, "entender", falsa)
    return respostas


def test_mensagem_curta_entendida_pela_ia_segue_direto(ia):
    ia["estou com fome"] = {"tipo": "pedido", "categoria": "alimentacao", "secundarias": [],
                            "resumo": "você está sem comida em casa"}
    with TestClient(app) as client:
        autenticar(client)
        r = conversa(client, telefone(), "oi", "1", "estou com fome", "1")
        assert "Entendi que você está sem comida em casa" in r[2][0] and "*alimentação*" in r[2][0]
        assert "Documentos para levar" in r[3][0]


def test_ia_entende_o_que_nao_tem_palavra_chave(ia):
    relato = "minha luz vai ser cortada amanha e nao tenho como pagar"
    ia[relato] = {"tipo": "pedido", "categoria": "renda_beneficio", "secundarias": [],
                  "resumo": "você não tem dinheiro para pagar a conta de luz"}
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
        conversa(client, telefone(), "oi", "1", relato, "1", "1")
        nova = [t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes]
        assert len(nova) == 1 and nova[0]["categoria"] == "renda_beneficio"
        assert nova[0]["metodo_decisao"].startswith("IA generativa")


def test_cumprimento_pede_o_relato_sem_gastar_tentativa(ia):
    ia["bom dia, tudo bem com voce?"] = {"tipo": "cumprimento", "categoria": "nao_identificado", "secundarias": [], "resumo": ""}
    with TestClient(app) as client:
        autenticar(client)
        r = conversa(client, telefone(), "oi", "1", "bom dia, tudo bem com voce?")
        assert "contar um pouco mais" in r[2][0]


def test_violencia_vista_pela_regra_vale_mesmo_se_a_ia_discordar(ia):
    relato = "meu marido me bateu ontem e disse que vai me matar"
    ia[relato] = {"tipo": "pedido", "categoria": "moradia", "secundarias": [], "resumo": "você precisa de outro lugar para morar"}
    with TestClient(app) as client:
        autenticar(client)
        r = conversa(client, telefone(), "oi", "1", relato)
        assert "190" in r[2][0]


def test_sem_ia_mensagem_curta_entendida_pelo_modelo_local_tambem_segue():
    with TestClient(app) as client:
        autenticar(client)
        r = conversa(client, telefone(), "oi", "1", "estou com fome")
        assert "Está certo?" in r[2][0] and "alimentação" in r[2][0]


def test_ia_nao_inventa_categoria():
    assert entendimento._validar({"tipo": "pedido", "categoria": "auxilio_gas", "secundarias": [], "resumo": "x"}) is None
    r = entendimento._validar({"tipo": "pedido", "categoria": "moradia", "secundarias": ["moradia", "inventada", "alimentacao"],
                               "resumo": "você foi despejado."})
    assert r == {"tipo": "pedido", "categoria": "moradia", "secundarias": ["alimentacao"], "resumo": "você foi despejado"}
    assert entendimento._validar({"tipo": "cumprimento", "categoria": "moradia", "secundarias": [], "resumo": "x"})["categoria"] == "nao_identificado"
