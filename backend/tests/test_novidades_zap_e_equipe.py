"""WhatsApp: "meu pedido", avaliação, retorno dias depois, resposta em áudio e espanhol.
Equipe: assumir o caso, histórico da pessoa, resumo pela IA e tempo de resposta."""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.api.v1.endpoints import atendimento, triagem as rotas_triagem, whatsapp_webhooks
from app.db import abrir_sessao
from app.main import app
from app.models import Conversa, agora
from app.services import acompanhamento
from app.services.anonimizacao import hash_telefone
from app.services.audio import voz
from app.services.bot import fluxo_conversa
from app.services.llm import traducao
from conftest import autenticar
from test_unidades import conversa, telefone

FILA = "/api/v1/triagem/fila"


def _novo_caso(client, tel, relato="perdi minha identidade e preciso tirar outra"):
    antes = {t["id"] for t in client.get(FILA).json()}
    conversa(client, tel, "oi", "1", relato, "1", "1")
    return next(t for t in client.get(FILA).json() if t["id"] not in antes)


def _mensagens(client, conversa_id):
    return client.get(f"/api/v1/atendimento/conversas/{conversa_id}/mensagens").json()["mensagens"]


def test_meu_pedido_diz_a_situacao_e_protege_violencia():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        r = conversa(client, tel, "oi", "1", "meu pedido")
        assert "Não encontrei pedido seu" in r[2][0]
        _novo_caso(client, tel)
        r = conversa(client, tel, "como está meu pedido?")
        assert "*documentos*" in r[0][0] and "*aguardando a equipe*" in r[0][0]

        tel2 = telefone()
        conversa(client, tel2, "meu marido me bateu e disse que vai me matar")
        r = conversa(client, tel2, "meu pedido")
        assert "190" in r[0][0] and "violência" not in r[0][0].lower()


def test_concluido_pede_nota_e_a_nota_fica_no_caso():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        caso = _novo_caso(client, tel)
        r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "CONCLUIDO"}).json()
        assert r["aviso"]["enviado"] and r["triagem"]["atendido_em"]
        assert "de *1* a *5*" in _mensagens(client, caso["conversa_id"])[-1]["texto"]
        r = conversa(client, tel, "5")
        assert "Obrigado pela resposta" in r[0][0]
        assert next(t for t in client.get(FILA).json() if t["id"] == caso["id"])["avaliacao"] == 5
        nota = client.get("/api/v1/triagem/indicadores/resumo").json()["avaliacao"]
        assert nota["respostas"] >= 1 and nota["por_nota"]["5"] >= 1


def test_quem_nao_quis_contato_recebe_retorno_e_pode_pedir_contato():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "2")

        async def rodar(dias):
            async with abrir_sessao() as session:
                return await acompanhamento.enviar_pendentes(session, agora() + timedelta(days=dias))

        client.portal.call(rodar, 1)  # antes do prazo: esta conversa ainda não recebe
        assert "conseguiu ir ao CRAS" not in _mensagens(client, hash_telefone(tel))[-1]["texto"]
        assert client.portal.call(rodar, 4) >= 1
        assert "Você conseguiu ir ao CRAS?" in _mensagens(client, hash_telefone(tel))[-1]["texto"]

        antes = {t["id"] for t in client.get(FILA).json()}
        r = conversa(client, tel, "2")
        assert "CRAS" in r[0][0]
        nova = [t for t in client.get(FILA).json() if t["id"] not in antes]
        assert len(nova) == 1 and nova[0]["categoria"] == "documentacao"


def test_violencia_nunca_agenda_retorno():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "meu marido me bateu e disse que vai me matar")

        async def ver():
            async with abrir_sessao() as session:
                return (await session.get(Conversa, hash_telefone(tel))).acompanhamento
        assert client.portal.call(ver) is None


ES_PT = {
    "hola": "olá",
    "no tengo comida para mis hijos": "não tenho comida para meus filhos",
    "¿cuándo me llaman?": "quando vocês me ligam?",
}


async def _traduzir_falso(textos, para):
    if para == "pt":
        return [ES_PT.get(t, t) for t in textos]
    return [t if not traducao.precisa_traduzir(t) else "[ES] " + t for t in textos]


def test_conversa_em_espanhol_vai_traduzida_e_a_equipe_le_em_portugues(monkeypatch):
    monkeypatch.setattr(fluxo_conversa, "traduzir", _traduzir_falso)
    monkeypatch.setattr(atendimento, "traduzir", _traduzir_falso)
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        antes = {t["id"] for t in client.get(FILA).json()}
        r = conversa(client, tel, "hola", "1", "no tengo comida para mis hijos", "1", "1")
        assert r[0][0].startswith("[ES] ") and "Você concorda?" in r[0][0]
        assert r[2][0].startswith("[ES] ") and "alimentação" in r[2][0]
        caso = next(t for t in client.get(FILA).json() if t["id"] not in antes)
        assert caso["idioma"] == "es" and caso["relato_original"] == "no tengo comida para mis hijos"
        assert caso["relato_traducao"] == "não tenho comida para meus filhos"

        msgs = _mensagens(client, caso["conversa_id"])
        da_pessoa = next(m for m in msgs if m["texto"] == "no tengo comida para mis hijos")
        assert da_pessoa["traducao"] == "não tenho comida para meus filhos"
        do_bot = next(m for m in msgs if m["autor"] == "bot" and m["texto"].startswith("[ES] "))
        assert do_bot["traducao"] and not do_bot["traducao"].startswith("[ES]")

        r = client.post(f"/api/v1/atendimento/conversas/{caso['conversa_id']}/responder", json={"texto": "Amanhã às 8h no CRAS."}).json()
        assert r["traduzida"]
        ultima = _mensagens(client, caso["conversa_id"])[-1]
        assert ultima["texto"] == "[ES] Amanhã às 8h no CRAS." and ultima["traducao"] == "Amanhã às 8h no CRAS."


def test_audio_so_quando_a_pessoa_pede(monkeypatch):
    falados = []

    async def transcrever(audio, mime="audio/ogg"):
        return "perdi minha identidade e preciso tirar outra"

    async def falar(texto, idioma=None):
        falados.append(texto)
        return b"RIFF-falso"
    monkeypatch.setattr(whatsapp_webhooks, "transcrever", transcrever)
    monkeypatch.setattr(fluxo_conversa, "falar", falar)
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "oi", "1")
        r = client.post("/api/v1/webhooks/simular-audio", data={"telefone": tel},
                        files={"audio": ("fala.webm", b"x", "audio/webm")}).json()
        assert r["audio_resposta"] is None and not falados  # mandar áudio não gera áudio de volta

        r = client.post("/api/v1/webhooks/simular", json={"telefone": tel, "texto": "manda em áudio"}).json()
        assert "Te mando em áudio" in r["respostas"][0] and r["audio_resposta"].startswith("data:audio/wav;base64,")
        assert "Está certo?" in falados[-1]  # falou a última resposta, não o pedido de áudio
        r = client.post("/api/v1/webhooks/simular", json={"telefone": tel, "texto": "1"}).json()
        assert "Documentos para levar" in r["respostas"][0]  # a conversa seguiu de onde estava
    falado = voz.texto_para_falar("📋 *Documentos*\nComo chegar: https://maps.google.com/x\n• RG")
    assert "*" not in falado and "http" not in falado and "📋" not in falado and "RG" in falado


def test_nao_entendi_oferece_audio_ou_explicacao_e_volta_para_a_etapa(monkeypatch):
    async def explicar(mensagem):
        return "Explicando com calma: " + mensagem

    async def sem_voz(texto, idioma=None):
        return None
    monkeypatch.setattr(fluxo_conversa, "explicar", explicar)
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        r = conversa(client, tel, "oi", "não entendi")
        assert "*1* - Ouvir em áudio" in r[1][0] and "*2* - Ler uma explicação" in r[1][0]
        r = conversa(client, tel, "não entendi")  # de novo: oferece de novo, não vira "não"
        assert "*1* - Ouvir em áudio" in r[0][0]
        r = conversa(client, tel, "2")
        assert r[0][0].startswith("Explicando com calma: ") and "Você concorda?" in r[0][0]
        r = conversa(client, tel, "1")  # voltou para o aceite: "1" é "Sim, concordo"
        assert "conte" in r[0][0].lower()

        # sem áudio disponível (sem crédito ou canal sem áudio): explica por escrito
        monkeypatch.setattr(fluxo_conversa, "falar", sem_voz)
        r = conversa(client, tel, "não entendi", "1")
        assert "Não consegui gravar o áudio" in r[1][0] and r[1][1].startswith("Explicando com calma: ")
        r = conversa(client, tel, "perdi minha identidade e preciso tirar outra")
        assert "Está certo?" in r[0][0]  # depois da ajuda, a conversa continua normal


def test_assumir_historico_resumo_e_tempo_de_resposta(monkeypatch):
    chamadas = []

    async def resumir(linhas):
        chamadas.append(linhas)
        return "Pessoa perdeu o RG e pediu contato do CRAS."
    monkeypatch.setattr(rotas_triagem, "resumir", resumir)
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        primeiro = _novo_caso(client, tel)
        conversa(client, tel, "recomeçar")
        segundo = _novo_caso(client, tel, "quero fazer um curso pra arrumar emprego")

        r = client.post(f"/api/v1/triagem/{segundo['id']}/assumir", json={}).json()
        assert r["triagem"]["status"] == "EM_ATENDIMENTO" and r["triagem"]["responsavel_nome"]
        assert r["triagem"]["atendido_em"] and r["aviso"]["enviado"]
        r = client.post(f"/api/v1/triagem/{segundo['id']}/assumir", json={"soltar": True}).json()
        assert r["triagem"]["responsavel"] is None and r["triagem"]["status"] == "EM_ATENDIMENTO"

        historico = client.get(f"/api/v1/triagem/{segundo['id']}/historico").json()
        assert [h["id"] for h in historico] == [primeiro["id"]] and historico[0]["categoria"] == "documentacao"

        assert client.get(f"/api/v1/triagem/{segundo['id']}/resumo-ia").json()["resumo"].startswith("Pessoa perdeu")
        client.get(f"/api/v1/triagem/{segundo['id']}/resumo-ia")
        assert len(chamadas) == 1  # guardado: não chama a IA de novo
        assert any(l.startswith("Pessoa: ") for l in chamadas[0]) and any(l.startswith("Bot: ") for l in chamadas[0])

        tempos = client.get("/api/v1/triagem/indicadores/resumo").json()["tempo_resposta"]
        assert any(t["demais"]["atendidos"] >= 1 and t["demais"]["mediana_min"] is not None for t in tempos)


def test_deteccao_de_espanhol():
    for t in ["hola", "necesito ayuda", "no tengo comida para mis hijos", "¿dónde queda?"]:
        assert traducao.parece_espanhol(t), t
    for t in ["oi", "estou com fome", "meu esposo me bateu", "perdi minha identidade", "1", "não sei"]:
        assert not traducao.parece_espanhol(t), t
