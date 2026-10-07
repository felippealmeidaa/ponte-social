"""Motor de fluxos: validação (ciclo, saídas, início, etapas soltas) e simulador (escolhas, condição, ferramenta, violência)."""
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services import catalogo
from app.services.agentes import executor as agentes
from app.services.fluxos import motor
from conftest import autenticar

ETAPAS = [
    {"id": "i", "tipo": "inicio", "titulo": "Início"},
    {"id": "oi", "tipo": "mensagem", "titulo": "Boas-vindas", "texto": "Olá! Aqui é a assistência social."},
    {"id": "p", "tipo": "pergunta", "titulo": "Fome?", "texto": "Falta comida em casa?", "opcoes": ["Sim", "Não"], "variavel": "fome"},
    {"id": "c", "tipo": "condicao", "titulo": "Confere", "variavel": "fome", "operador": "igual", "valor": "sim"},
    {"id": "f", "tipo": "ferramenta", "titulo": "Serviços", "ferramenta": "servicos_da_necessidade", "argumentos": {"necessidade": "alimentacao"}, "variavel": "servico"},
    {"id": "m", "tipo": "mensagem", "titulo": "Orienta", "texto": "Você respondeu {{fome}}. Veja o que levar."},
    {"id": "q", "tipo": "fila", "titulo": "Fila", "necessidade": "alimentacao", "texto": "Vou pedir para o CRAS falar com você."},
    {"id": "fim", "tipo": "fim", "titulo": "Fim", "texto": "Tudo bem, até mais."},
]
LIGACOES = [
    {"de": "i", "saida": "proximo", "para": "oi"}, {"de": "oi", "saida": "proximo", "para": "p"},
    {"de": "p", "saida": "opcao:1", "para": "c"}, {"de": "p", "saida": "opcao:2", "para": "fim"}, {"de": "p", "saida": "outra", "para": "fim"},
    {"de": "c", "saida": "sim", "para": "f"}, {"de": "c", "saida": "nao", "para": "fim"},
    {"de": "f", "saida": "proximo", "para": "m"}, {"de": "m", "saida": "proximo", "para": "q"},
]


def test_validacao():
    assert motor.validar(ETAPAS, LIGACOES, set()) == []
    ciclo = LIGACOES[:-1] + [{"de": "m", "saida": "proximo", "para": "p"}]
    assert any("ciclo" in e for e in motor.validar(ETAPAS, ciclo, set()))
    sem_outra = [l for l in LIGACOES if l["saida"] != "outra"]
    assert any("outra resposta" in e for e in motor.validar(ETAPAS, sem_outra, set()))
    dois_inicios = ETAPAS + [{"id": "i2", "tipo": "inicio", "titulo": "Outro início"}]
    assert any("exatamente uma etapa de início" in e for e in motor.validar(dois_inicios, LIGACOES + [{"de": "i2", "saida": "proximo", "para": "fim"}], set()))
    solta = ETAPAS + [{"id": "x", "tipo": "fim", "titulo": "Esquecida"}]
    assert any("Esquecida" in e for e in motor.validar(solta, LIGACOES, set()))
    assert any("saída que essa etapa não tem" in e for e in motor.validar(ETAPAS, LIGACOES + [{"de": "fim", "saida": "proximo", "para": "p"}], set()))
    agente_inexistente = ETAPAS + [{"id": "a", "tipo": "agente", "titulo": "IA", "agente_id": "nao-existe"}]
    assert any("agente que exista" in e for e in motor.validar(agente_inexistente, LIGACOES, set()))
    assert any("escreva o texto" in e for e in motor.validar([{**e, "texto": ""} if e["id"] == "oi" else e for e in ETAPAS], LIGACOES, set()))


def _fluxo(client, etapas=ETAPAS, ligacoes=LIGACOES):
    r = client.post("/api/v1/fluxos", json={"nome": f"Fome {uuid.uuid4().hex[:4]}", "etapas": etapas, "ligacoes": ligacoes})
    assert r.status_code == 201, r.text
    return r.json()


def test_simulador_caminhos():
    with TestClient(app) as client:
        autenticar(client)
        f = _fluxo(client)
        assert f["problemas"] == []
        url = f"/api/v1/fluxos/{f['id']}/simular"

        r = client.post(url, json={}).json()
        assert r["respostas"][0].startswith("Olá") and "*1* - Sim" in r["respostas"][1] and r["estado"]["etapa"] == "p"

        sim = client.post(url, json={"estado": r["estado"], "mensagem": "1"}).json()
        assert sim["estado"]["terminado"] and sim["estado"]["motivo"] == "fila"
        assert "Você respondeu Sim" in sim["respostas"][0] and "CRAS falar com você" in sim["respostas"][1]
        ferramenta = next(e for e in sim["eventos"] if e["tipo"] == "ferramenta")
        assert ferramenta["resultado"]["servicos"] and any("nenhum caso é criado" in e["detalhe"] for e in sim["eventos"])

        nao = client.post(url, json={"estado": r["estado"], "mensagem": "nao"}).json()  # texto da opção, sem acento
        assert nao["estado"]["motivo"] == "fim" and nao["respostas"] == ["Tudo bem, até mais."]

        outra = client.post(url, json={"estado": r["estado"], "mensagem": "talvez amanha"}).json()
        assert outra["estado"]["motivo"] == "fim" and any("outra" in (e.get("detalhe") or "") for e in outra["eventos"])

        violencia = client.post(url, json={"estado": r["estado"], "mensagem": "meu marido me bateu e ameaçou me matar"}).json()
        assert violencia["estado"]["motivo"] == "violencia" and violencia["respostas"] == [catalogo.texto("emergencia")]

        depois = client.post(url, json={"estado": sim["estado"], "mensagem": "oi"}).json()
        assert "já terminou" in depois["eventos"][0]["detalhe"]


def test_simulador_recusa_fluxo_com_problema_e_roda_agente(monkeypatch):
    async def agente_falso(session, agente, historico, mensagem):
        return {"resposta": f"Resposta do agente para: {mensagem}", "passos": [], "violencia": False}

    monkeypatch.setattr(agentes, "responder", agente_falso)
    with TestClient(app) as client:
        autenticar(client)
        incompleto = _fluxo(client, ETAPAS, LIGACOES[:-1])
        assert incompleto["problemas"]
        assert client.post(f"/api/v1/fluxos/{incompleto['id']}/simular", json={}).status_code == 422

        ag = client.post("/api/v1/agentes", json={"nome": "Ajuda", "instrucoes": "Você orienta sobre alimentação em poucas frases.", "ferramentas": []}).json()
        etapas = [{"id": "i", "tipo": "inicio"}, {"id": "p", "tipo": "pergunta", "titulo": "Conta", "texto": "Conte o que precisa", "opcoes": ["Falar com a IA"]},
                  {"id": "a", "tipo": "agente", "titulo": "IA", "agente_id": ag["id"], "entrada": "{{resposta}}"}, {"id": "z", "tipo": "fim"}]
        ligacoes = [{"de": "i", "saida": "proximo", "para": "p"}, {"de": "p", "saida": "opcao:1", "para": "a"},
                    {"de": "p", "saida": "outra", "para": "a"}, {"de": "a", "saida": "proximo", "para": "z"}]
        f = _fluxo(client, etapas, ligacoes)
        assert f["problemas"] == []
        url = f"/api/v1/fluxos/{f['id']}/simular"
        r = client.post(url, json={}).json()
        r = client.post(url, json={"estado": r["estado"], "mensagem": "to sem comida em casa"}).json()
        assert r["respostas"] == ["Resposta do agente para: to sem comida em casa"] and r["estado"]["motivo"] == "fim"


def test_resposta_curta_nao_vira_violencia_mas_relato_com_violencia_sim():
    with TestClient(app) as client:
        autenticar(client)
        f = _fluxo(client)
        url = f"/api/v1/fluxos/{f['id']}/simular"
        r = client.post(url, json={}).json()
        # "sim, ta faltando" escolhe a opção Sim: o modelo sensível não é consultado
        ok = client.post(url, json={"estado": r["estado"], "mensagem": "sim, ta faltando"}).json()
        assert ok["estado"]["motivo"] == "fila"
        # mas uma opção escolhida junto com relato de violência ainda para o fluxo (regra de palavras)
        v = client.post(url, json={"estado": r["estado"], "mensagem": "sim, e meu marido me bateu"}).json()
        assert v["estado"]["motivo"] == "violencia"


def test_resultado_de_consulta_vira_texto_legivel():
    variaveis = {"orientacao": {"titulo": "Segurança alimentar", "servicos": ["Cesta básica"], "documentos": ["RG"], "onde": "CRAS"},
                 "cras": {"cras": None, "aviso": "bairro não está na lista"}}
    texto = motor._preencher("{{orientacao}} | {{cras}}", variaveis)
    assert "*Segurança alimentar*" in texto and "• Cesta básica" in texto and "{" not in texto and "bairro não está na lista" in texto
