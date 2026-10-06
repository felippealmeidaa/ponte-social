"""Fotos de documentos pelo WhatsApp: só depois de pedir contato, conferência local da foto, guardadas cifradas,
abertas só pela equipe (com registro), pedido de nova foto pelo painel e apagadas no prazo."""
import io
from datetime import timedelta

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.db import abrir_sessao
from app.main import app
from app.models import DocumentoAnexo, Triagem, agora
from app.services import documentos
from conftest import autenticar
from test_unidades import conversa, telefone

FILA = "/api/v1/triagem/fila"


def _imagem(largura=1200, altura=900, tipo="nitida") -> bytes:
    rng = np.random.default_rng(1)
    if tipo == "escura":
        pixels = rng.integers(0, 25, (altura, largura), dtype=np.uint8)
    elif tipo == "borrada":
        pixels = np.full((altura, largura), 150, dtype=np.uint8)
    else:  # textura com bordas fortes, como um documento com letras
        pixels = rng.integers(60, 255, (altura, largura), dtype=np.uint8)
    saida = io.BytesIO()
    Image.fromarray(pixels, "L").convert("RGB").save(saida, "JPEG", quality=90)
    return saida.getvalue()


def _foto(client, tel, conteudo, nome="doc.jpg", mime="image/jpeg"):
    r = client.post("/api/v1/webhooks/simular-anexo", data={"telefone": tel}, files={"arquivo": (nome, conteudo, mime)})
    assert r.status_code == 200, r.text
    return r.json()["respostas"]


def _pedido_com_contato(client, tel):
    antes = {t["id"] for t in client.get(FILA).json()}
    r = conversa(client, tel, "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "1")
    caso = next(t for t in client.get(FILA).json() if t["id"] not in antes)
    return r, caso


def test_conferencia_local_da_foto():
    assert documentos.verificar(_imagem(), "image/jpeg")[0] is None
    assert documentos.verificar(_imagem(300, 200), "image/jpeg")[0] == "pequena"
    assert documentos.verificar(_imagem(tipo="escura"), "image/jpeg")[0] == "escura"
    assert documentos.verificar(_imagem(tipo="borrada"), "image/jpeg")[0] == "tremida"
    assert documentos.verificar(b"%PDF-1.4 ...", "application/pdf")[0] is None
    assert documentos.verificar(b"xx", "video/mp4")[0] == "tipo"


def test_depois_do_contato_a_pessoa_manda_as_fotos_e_a_equipe_ve():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        r, caso = _pedido_com_contato(client, tel)
        assert "*1* - Quero mandar as fotos agora" in r[4][-1] and "apagadas depois do atendimento" in r[4][-1]

        r = conversa(client, tel, "1")
        assert "documento inteiro" in r[0][0] and "• " in r[0][0] and "pronto" in r[0][0]
        assert "Recebi o documento 1" in _foto(client, tel, _imagem())[0]
        assert "pequena demais" in _foto(client, tel, _imagem(300, 200))[0]  # recusada, não conta
        r = conversa(client, tel, "pronto")
        assert "Recebi 1 documento e anexei ao seu pedido" in r[0][0]

        assert next(t for t in client.get(FILA).json() if t["id"] == caso["id"])["documentos_enviados"] == 1
        lista = client.get(f"/api/v1/triagem/{caso['id']}/documentos").json()
        assert len(lista) == 1 and lista[0]["mime"] == "image/jpeg" and lista[0]["largura"] == 1200

        arquivo = client.get(f"/api/v1/triagem/{caso['id']}/documentos/{lista[0]['id']}/arquivo")
        assert arquivo.status_code == 200 and arquivo.content == _imagem() and arquivo.headers["cache-control"] == "no-store"
        observacoes = next(t for t in client.get(FILA).json() if t["id"] == caso["id"])["observacoes"]
        assert "Documentos vistos por" in observacoes

        async def bruto():
            async with abrir_sessao() as session:
                return (await session.get(DocumentoAnexo, lista[0]["id"])).conteudo_cifrado
        assert client.portal.call(bruto) != _imagem()  # guardado cifrado

        # equipe pede outra foto: a pessoa recebe o pedido e pode mandar de novo
        r = client.post(f"/api/v1/triagem/{caso['id']}/documentos/{lista[0]['id']}/revisao",
                        json={"situacao": "refazer", "motivo": "falta o verso do RG"}).json()
        assert r["pedido_enviado"] and r["documento"]["situacao"] == "refazer"
        msgs = client.get(f"/api/v1/atendimento/conversas/{caso['conversa_id']}/mensagens").json()["mensagens"]
        assert "falta o verso do RG" in msgs[-1]["texto"]
        assert "Recebi o documento 2" in _foto(client, tel, _imagem(), "verso.png", "image/png")[0]


def test_quem_prefere_ir_pessoalmente_e_foto_fora_de_hora_nao_e_guardada():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        _, caso = _pedido_com_contato(client, tel)
        r = conversa(client, tel, "2")
        assert "Leve os documentos originais" in r[0][0]
        r = _foto(client, tel, _imagem())  # depois de escolher ir pessoalmente
        assert "só guardo fotos de documentos depois" in r[0]
        assert client.get(f"/api/v1/triagem/{caso['id']}/documentos").json() == []

        tel2 = telefone()
        r = _foto(client, tel2, _imagem())  # antes de qualquer conversa
        assert "só guardo fotos" in r[0]


def test_apagar_e_prazo_removem_as_fotos():
    with TestClient(app) as client:
        autenticar(client)
        tel = telefone()
        _, caso = _pedido_com_contato(client, tel)
        conversa(client, tel, "1")
        _foto(client, tel, _imagem())

        async def contar(triagem_id):
            async with abrir_sessao() as session:
                return await documentos.quantos(session, triagem_id)
        assert client.portal.call(contar, caso["id"]) == 1

        async def envelhecer():
            async with abrir_sessao() as session:
                t = await session.get(Triagem, caso["id"])
                t.status, t.atualizado_em = "CONCLUIDO", agora() - timedelta(days=40)
                await session.commit()
                return await documentos.aplicar_retencao(session)
        assert client.portal.call(envelhecer) >= 1 and client.portal.call(contar, caso["id"]) == 0

        tel2 = telefone()
        _, caso2 = _pedido_com_contato(client, tel2)
        conversa(client, tel2, "1")
        _foto(client, tel2, _imagem())
        conversa(client, tel2, "apagar", "1")
        assert client.portal.call(contar, caso2["id"]) == 0
