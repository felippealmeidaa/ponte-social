"""Lugares mais perto: pino do WhatsApp (ou coordenadas digitadas) escolhe o CRAS e ordena os lugares da rede."""
from fastapi.testclient import TestClient

from app.main import app
from app.services import geo
from conftest import autenticar
from test_unidades import conversa, telefone, unidades

# Pontos de teste: a pessoa está perto do "CRAS Perto"; o restaurante fica a ~1 km dela
PESSOA = (-16.300, -48.950)
CRAS_PERTO = {"nome": "CRAS Perto", "tipo": "CRAS", "endereco": "Rua A, 1", "latitude": -16.302, "longitude": -48.951}
CRAS_LONGE = {"nome": "CRAS Longe", "tipo": "CRAS", "endereco": "Rua B, 2", "latitude": -16.400, "longitude": -48.990}
RESTAURANTE = {"nome": "Restaurante Popular Teste", "tipo": "RESTAURANTE_POPULAR", "endereco": "Rua C, 3",
               "horario": "Seg. a sex., 11h às 13h", "latitude": -16.309, "longitude": -48.950}
SINE = {"nome": "SINE Teste", "tipo": "SINE", "endereco": "Rua D, 4", "latitude": -16.300, "longitude": -48.951}


def _simular(client, tel, texto="", ponto=None):
    corpo = {"telefone": tel, "texto": texto}
    if ponto:
        corpo["latitude"], corpo["longitude"] = ponto
    r = client.post("/api/v1/webhooks/simular", json=corpo)
    assert r.status_code == 200, r.text
    return r.json()["respostas"]


def test_distancia_e_coordenadas_digitadas():
    assert 1.0 < geo.distancia_km(PESSOA, (-16.309, -48.950)) < 1.1
    assert geo.coordenadas_no_texto("-16.3267, -48.9528") == (-16.3267, -48.9528)
    assert geo.coordenadas_no_texto("-16,3267 -48,9528") == (-16.3267, -48.9528)
    assert geo.coordenadas_no_texto("vila jaiara") is None
    assert geo.texto_distancia(0.43) == "400 m" and geo.texto_distancia(2.25) == "2,2 km"


def test_pino_escolhe_o_cras_mais_perto_e_ordena_os_lugares():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_LONGE, CRAS_PERTO, RESTAURANTE, SINE) as (_, perto, *_resto):
            tel = telefone()
            r = conversa(client, tel, "oi", "1")
            assert "localização" in r[1][0]
            resposta = _simular(client, tel, ponto=PESSOA)
            assert "O CRAS mais perto de você é o *CRAS Perto*" in resposta[0]

            antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
            r = conversa(client, tel, "nao temos nada para comer em casa e meus filhos estao com fome", "1")
            caminho = r[1][0]
            assert "Lugares mais perto de você" in caminho
            # do mais perto ao mais longe: CRAS Perto (~200 m), restaurante (~1 km), CRAS Longe
            assert caminho.index("*CRAS Perto* (a 200 m)") < caminho.index("*Restaurante Popular Teste* (a 1,0 km)")
            assert "SINE Teste" not in caminho  # não atende alimentação
            assert "Como chegar: https://www.google.com/maps/search/?api=1&query=-16.309%2C-48.95" in caminho

            conversa(client, tel, "1")
            nova = next(t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes)
            assert nova["unidade_id"] == perto["id"]


def test_coordenadas_digitadas_valem_como_pino_e_pino_depois_do_caminho_mostra_lugares():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO, SINE):
            tel = telefone()
            r = conversa(client, tel, "oi", "1", "não sei", "quero fazer um curso pra arrumar emprego", "1")
            assert "Se mandar sua *localização*" in r[4][0]  # sem ponto: sugere mandar
            resposta = _simular(client, tel, ponto=PESSOA)        # ainda esperando o 1/2 do contato
            assert "Recebi sua localização" in resposta[0] and "*SINE Teste* (a 100 m)" in resposta[0]

            tel2 = telefone()
            r = conversa(client, tel2, "oi", "1", "-16.300, -48.950")
            assert "CRAS Perto" in r[2][0]


def test_localizacao_antes_do_aceite_nao_e_guardada():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO):
            tel = telefone()
            resposta = _simular(client, tel, ponto=PESSOA)
            assert "concorda" in resposta[0]
            r = conversa(client, tel, "1")
            assert "localização" in r[0][0]  # ainda pergunta: o ponto de antes do aceite foi descartado


def test_emergencia_mostra_o_creas_mais_perto_com_mapa():
    creas_perto = {"nome": "CREAS Perto", "tipo": "CREAS", "endereco": "Rua E, 5", "latitude": -16.301, "longitude": -48.950}
    creas_longe = {"nome": "CREAS Longe", "tipo": "CREAS", "endereco": "Rua F, 6", "latitude": -16.420, "longitude": -48.990}
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO, creas_longe, creas_perto):
            tel = telefone()
            conversa(client, tel, "oi", "1")
            _simular(client, tel, ponto=PESSOA)
            r = conversa(client, tel, "meu marido me bateu e disse que vai me matar")
            assert "190" in r[0][0]
            assert r[0][0].index("CREAS Perto") < r[0][0].index("CREAS Longe")


def test_tipo_outro_exige_necessidades_e_categorias_personalizadas_valem():
    with TestClient(app) as client:
        autenticar(client)
        assert client.post("/api/v1/configuracao/unidades",
                           json={"nome": "Lugar sem assunto", "tipo": "OUTRO", "endereco": "Rua G"}).status_code == 422
        banco = {"nome": "Banco de Alimentos Teste", "tipo": "OUTRO", "endereco": "Rua H", "categorias": ["alimentacao"],
                 "latitude": -16.3, "longitude": -48.95}
        with unidades(client, banco) as (criado,):
            assert criado["categorias"] == ["alimentacao"] and criado["mapa"].endswith("-16.3%2C-48.95")
