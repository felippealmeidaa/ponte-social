"""Áudio transcrito no fluxo do bot e aviso de andamento pelo WhatsApp."""
from fastapi.testclient import TestClient

from app.api.v1.endpoints import whatsapp_webhooks
from app.main import app
from app.services.audio import transcricao
from conftest import autenticar
from test_unidades import conversa, telefone


def _audio(client, tel, monkeypatch, ouvido):
    async def falso(audio, mime="audio/ogg"):
        assert audio == b"audio-falso"
        return ouvido
    monkeypatch.setattr(whatsapp_webhooks, "transcrever", falso)
    r = client.post("/api/v1/webhooks/simular-audio", data={"telefone": tel},
                    files={"audio": ("fala.webm", b"audio-falso", "audio/webm")})
    assert r.status_code == 200, r.text
    return r.json()


def test_audio_transcrito_segue_o_fluxo_e_o_bot_diz_o_que_ouviu(monkeypatch):
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "oi", "1")
        r = _audio(client, tel, monkeypatch, "perdi minha identidade e preciso tirar outra")
        assert r["transcricao"] == "perdi minha identidade e preciso tirar outra"
        assert r["respostas"][0].startswith("🎤 Ouvi seu áudio assim: “perdi minha identidade")
        assert "documentos" in r["respostas"][1].lower()
        historico = client.get(f"/api/v1/atendimento/conversas/{r['conversa_id']}/mensagens").json()
        textos = [m["texto"] for m in (historico["mensagens"] if isinstance(historico, dict) else historico)]
        assert "🎤 perdi minha identidade e preciso tirar outra" in textos


def test_audio_sem_transcricao_pede_para_escrever_e_violencia_vem_sem_eco(monkeypatch):
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        conversa(client, tel, "oi", "1")
        r = _audio(client, tel, monkeypatch, None)
        assert r["transcricao"] is None and "Não consegui entender seu áudio" in r["respostas"][0]
        r = _audio(client, tel, monkeypatch, "meu marido me bateu e disse que vai me matar")
        assert "190" in r["respostas"][0] and not any("Ouvi seu áudio" in x for x in r["respostas"])


def test_transcricao_nunca_inventa_texto():
    assert transcricao._limpar("[inaudível]") is None and transcricao._limpar("  ") is None
    assert transcricao._limpar(' "estou sem comida" ') == "estou sem comida"


def _caso_whatsapp(client, relato):
    antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
    conversa(client, telefone(), "oi", "1", relato, "1", "1")
    return next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)


def test_aviso_de_andamento_vai_pelo_whatsapp_uma_vez_por_mudanca():
    with TestClient(app) as client:
        autenticar(client)
        caso = _caso_whatsapp(client, "perdi minha identidade e preciso tirar outra")
        r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "EM_ATENDIMENTO"}).json()
        assert r["aviso"] == {"enviado": True, "motivo": None}
        historico = client.get(f"/api/v1/atendimento/conversas/{caso['conversa_id']}/mensagens").json()
        textos = [m["texto"] for m in (historico["mensagens"] if isinstance(historico, dict) else historico)]
        assert any("recebeu seu pedido sobre *documentos*" in t for t in textos)
        # mesma situação de novo (só salvar observações): não avisa outra vez
        r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "EM_ATENDIMENTO", "observacoes": "liguei"}).json()
        assert r["aviso"] is None
        # o técnico pode escolher não avisar
        r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "CONCLUIDO", "avisar": False}).json()
        assert r["aviso"] is None


def test_violencia_nunca_recebe_aviso():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
        conversa(client, telefone(), "meu marido me bateu e disse que vai me matar")
        caso = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)
        r = client.patch(f"/api/v1/triagem/{caso['id']}/status", json={"status": "EM_ATENDIMENTO"}).json()
        assert r["aviso"] == {"enviado": False, "motivo": "violencia"}


def test_datas_vao_com_fuso_para_o_painel_nao_adiantar_3_horas():
    with TestClient(app) as client:
        autenticar(client)
        caso = _caso_whatsapp(client, "perdi minha identidade e preciso tirar outra")
        assert caso["criado_em"].endswith("+00:00")
