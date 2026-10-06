"""Lugares mais perto: pino do WhatsApp (ou coordenadas digitadas) escolhe o CRAS; o lugar do benefício vem antes da ajuda imediata."""
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
    assert geo.texto_distancia(0.04) == "menos de 100 m" and geo.texto_distancia(0.43) == "400 m" and geo.texto_distancia(2.25) == "2,2 km"


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
            # primeiro onde se pede o benefício (o CRAS da pessoa, depois os outros); a ajuda imediata vem depois,
            # mesmo o restaurante (~1 km) estando mais perto que o CRAS Longe
            assert caminho.index("Onde pedir o benefício") < caminho.index("*CRAS Perto* (a 200 m)") \
                < caminho.index("*CRAS Longe*") < caminho.index("Para ajuda imediata") \
                < caminho.index("*Restaurante Popular Teste* (a 1,0 km)")
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


def _cep_falso(monkeypatch, cidade="Anápolis"):
    async def buscar_cep(cep):
        enderecos = {"75000000": {"bairro": "Vila Jaiara", "logradouro": "Rua Teste", "localidade": cidade},
                     "75000001": {"bairro": "", "logradouro": "", "localidade": cidade}}
        return enderecos.get(cep)
    monkeypatch.setattr(geo, "buscar_cep", buscar_cep)


def test_pessoa_escolhe_como_informar_o_local(monkeypatch):
    _cep_falso(monkeypatch)
    cras = {**CRAS_PERTO, "bairros": ["Vila Jaiara"]}
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras):
            tel = telefone()
            r = conversa(client, tel, "oi", "1", "1", "2", "3")
            assert "*2* - Digitar meu CEP" in r[1][0] and "*4* - Prefiro não informar" in r[1][0]
            assert "Enviar localização atual" in r[2][0]
            assert "CEP" in r[3][0] and "bairro" in r[4][0]
            r = conversa(client, tel, "75000-999")  # CEP que não existe: continua esperando
            assert "Não encontrei esse CEP" in r[0][0]
            r = conversa(client, tel, "75.000-000")
            assert "Pelo CEP, seu bairro é *Vila Jaiara*" in r[0][0] and "CRAS Perto" in r[0][0]

            r = conversa(client, telefone(), "oi", "1", "4")
            assert "CRAS" not in r[2][0] and "conte" in r[2][0].lower()


def test_cep_de_outra_cidade_ou_sem_bairro_nao_vale(monkeypatch):
    _cep_falso(monkeypatch, cidade="Goiânia")
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO):
            r = conversa(client, telefone(), "oi", "1", "75000000")
            assert "Não encontrei esse CEP" in r[2][0]
    _cep_falso(monkeypatch)
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO):
            r = conversa(client, telefone(), "oi", "1", "75000001")
            assert "Não encontrei esse CEP" in r[2][0]


def test_cep_nao_fica_no_historico():
    from app.services.anonimizacao import anonimizar_texto
    assert anonimizar_texto("moro no cep 75000-000") == "moro no cep [cep]"
    assert anonimizar_texto("75.000-000") == "[cep]" and anonimizar_texto("75000000") == "[cep]"
    assert geo.cep_no_texto("CEP: 75000-000") == "75000000" and geo.cep_no_texto("750000") is None


def test_com_fome_o_cras_vem_antes_do_restaurante_mesmo_mais_longe():
    ao_lado_do_restaurante = (RESTAURANTE["latitude"], RESTAURANTE["longitude"])
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO, RESTAURANTE):
            tel = telefone()
            conversa(client, tel, "oi", "1")
            _simular(client, tel, ponto=ao_lado_do_restaurante)
            r = conversa(client, tel, "nao temos nada para comer em casa e meus filhos estao com fome", "1")
            caminho = r[1][0]
            assert "*Restaurante Popular Teste* (a menos de 100 m)" in caminho
            assert caminho.index("*CRAS Perto*") < caminho.index("*Restaurante Popular Teste*")


def test_cras_de_referencia_vem_antes_de_outro_cras_mais_perto():
    referencia = {**CRAS_LONGE, "bairros": ["Vila Jaiara"]}
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, CRAS_PERTO, referencia):
            tel = telefone()
            conversa(client, tel, "oi", "1", "vila jaiara")
            r = conversa(client, tel, "preciso atualizar o cadastro unico da minha familia", "1")
            assert r[1][0].index("*CRAS Longe*") < r[1][0].index("*CRAS Perto*")
