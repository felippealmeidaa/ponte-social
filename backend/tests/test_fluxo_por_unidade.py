"""Cada CRAS com seu fluxo: textos, respostas e opções próprias, e equipe que só enxerga a sua unidade."""
import uuid

from fastapi.testclient import TestClient

from app.main import app
from conftest import autenticar
from test_unidades import conversa, cras_teste, telefone, unidades

RELATO = "perdi minha identidade e preciso tirar outra"


def _entrar(login, senha):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username_or_email": login, "password": senha})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c


def _conta(client, unidade_id, papel="ADMIN"):
    login = f"cras{uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/equipe", json={"login": login, "nome": "Equipe CRAS", "senha": "senha-forte-1",
                                             "papel": papel, "unidade_id": unidade_id})
    assert r.status_code == 200, r.text
    return login, r.json()


def test_texto_e_resposta_personalizados_valem_so_para_o_cras():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            uid = cras["id"]
            r = client.put(f"/api/v1/configuracao/textos/pedir_relato?unidade={uid}", json={"texto": "Conte pra gente do Norte o que houve."})
            assert r.status_code == 200
            servico = next(s for s in client.get(f"/api/v1/configuracao/servicos?unidade={uid}").json() if s["categoria"] == "documentacao")
            assert servico["personalizado"] is False
            r = client.put(f"/api/v1/configuracao/servicos/documentacao?unidade={uid}", json={**servico, "local_atendimento": "Sala 3 do CRAS Norte"})
            assert r.status_code == 200

            do_norte = conversa(client, telefone(), "oi", "1", "vila jaiara", RELATO, "1")
            assert "pra gente do Norte" in do_norte[2][0]
            assert "Sala 3 do CRAS Norte" in do_norte[4][0]

            de_fora = conversa(client, telefone(), "oi", "1", "não sei", RELATO, "1")
            assert "pra gente do Norte" not in de_fora[2][0]
            assert "Sala 3 do CRAS Norte" not in de_fora[4][0]

            textos = {t["chave"]: t for t in client.get(f"/api/v1/configuracao/textos?unidade={uid}").json()}
            assert textos["pedir_relato"]["personalizado"] is True and textos["boas_vindas"]["personalizado"] is False
            # voltar ao padrão apaga a personalização do CRAS
            client.post(f"/api/v1/configuracao/textos/pedir_relato/restaurar?unidade={uid}")
            client.post(f"/api/v1/configuracao/servicos/documentacao/restaurar?unidade={uid}")
            de_novo = conversa(client, telefone(), "oi", "1", "vila jaiara", RELATO, "1")
            assert "pra gente do Norte" not in de_novo[2][0] and "Sala 3" not in de_novo[4][0]


def test_opcoes_de_fluxo_por_cras():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            uid = cras["id"]
            r = client.put(f"/api/v1/configuracao/fluxo/opcoes?unidade={uid}",
                           json={"opcoes": {"confirmar_necessidade": False, "contato": "sempre"}})
            assert r.status_code == 200 and sorted(r.json()["personalizadas"]) == ["confirmar_necessidade", "contato"]

            antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
            r = conversa(client, telefone(), "oi", "1", "vila jaiara", RELATO)
            assert "Está certo?" not in r[3][0]                       # sem confirmação
            assert "Documentos para levar" in r[3][0] and "Quer que o CRAS" not in r[3][0]
            assert "enviada para a equipe do CRAS" in r[3][1]          # contato "sempre": entra direto na fila
            nova = [t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes]
            assert len(nova) == 1 and nova[0]["unidade_id"] == uid and nova[0]["categoria_confirmada_pelo_cidadao"] is False

            client.put(f"/api/v1/configuracao/fluxo/opcoes?unidade={uid}", json={"opcoes": {"contato": "nunca"}})
            antes = {t["id"] for t in client.get("/api/v1/triagem/fila").json()}
            r = conversa(client, telefone(), "oi", "1", "vila jaiara", RELATO)
            assert "Procure o CRAS com os documentos" in r[3][1]
            assert not [t for t in client.get("/api/v1/triagem/fila").json() if t["id"] not in antes]

            # quem é de fora do CRAS segue o padrão da secretaria (com confirmação)
            r = conversa(client, telefone(), "oi", "1", "não sei", RELATO)
            assert "Está certo?" in r[3][0]

            # valor igual ao da secretaria deixa de ser personalização
            r = client.put(f"/api/v1/configuracao/fluxo/opcoes?unidade={uid}",
                           json={"opcoes": {"confirmar_necessidade": True, "contato": "perguntar"}})
            assert r.json()["personalizadas"] == []


def test_travas_e_validacao_das_opcoes():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (cras,):
            uid = cras["id"]
            put = lambda opcoes, u=uid: client.put(f"/api/v1/configuracao/fluxo/opcoes?unidade={u}", json={"opcoes": opcoes})
            assert put({"violencia": False}).status_code == 422          # travada: nem existe como opção
            assert put({"aceite": False}).status_code == 422
            assert put({"perguntar_bairro": False}).status_code == 422   # só a secretaria muda
            assert put({"contato": "talvez"}).status_code == 422
            assert put({"confirmar_necessidade": "sim"}).status_code == 422
            assert client.put("/api/v1/configuracao/fluxo/opcoes", json={"opcoes": {"perguntar_bairro": True}}).status_code == 200


def test_conta_do_cras_so_enxerga_a_propria_unidade():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste(), cras_teste(nome="CRAS Teste Sul", bairros=["Jundiaí"])) as (norte, sul):
            conversa(client, telefone(), "oi", "1", "vila jaiara", RELATO, "1", "1")
            conversa(client, telefone(), "oi", "1", "jundiai", RELATO, "1", "1")
            login, _ = _conta(client, norte["id"])
            equipe_norte = _entrar(login, "senha-forte-1")

            fila = equipe_norte.get("/api/v1/triagem/fila").json()
            assert fila and all(t["unidade_id"] == norte["id"] for t in fila)
            caso_sul = next(t for t in client.get("/api/v1/triagem/fila").json() if t["unidade_id"] == sul["id"])
            assert equipe_norte.patch(f"/api/v1/triagem/{caso_sul['id']}/status", json={"status": "CONCLUIDO"}).status_code == 404
            assert equipe_norte.get(f"/api/v1/triagem/{caso_sul['id']}/contato").status_code == 404
            conversas = equipe_norte.get("/api/v1/atendimento/conversas").json()
            assert conversas and all(c["triagem"] is None or c["triagem"]["id"] != caso_sul["id"] for c in conversas)

            # configuração: só a própria unidade
            assert equipe_norte.get(f"/api/v1/configuracao/textos?unidade={sul['id']}").status_code == 403
            assert equipe_norte.put("/api/v1/configuracao/textos/retorno", json={"texto": "Oi de novo, Norte!"}).status_code == 200
            textos_norte = {t["chave"]: t for t in client.get(f"/api/v1/configuracao/textos?unidade={norte['id']}").json()}
            assert textos_norte["retorno"]["texto"] == "Oi de novo, Norte!"
            padrao = {t["chave"]: t for t in client.get("/api/v1/configuracao/textos").json()}
            assert padrao["retorno"]["texto"] != "Oi de novo, Norte!"     # não mexeu no padrão da secretaria

            # cadastro de CRAS é só da coordenação geral
            assert equipe_norte.post("/api/v1/configuracao/unidades", json=cras_teste(nome="Outro")).status_code == 403


def test_equipe_do_cras_gerencia_so_a_propria_unidade():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (norte,):
            login, _ = _conta(client, norte["id"])
            coord_norte = _entrar(login, "senha-forte-1")
            # cria na própria unidade, mesmo pedindo "coordenação geral"
            r = coord_norte.post("/api/v1/equipe", json={"login": f"x{uuid.uuid4().hex[:6]}", "nome": "Novo", "senha": "senha-forte-1",
                                                        "papel": "ADMIN", "unidade_id": None})
            assert r.status_code == 200 and r.json()["unidade_id"] == norte["id"]
            assert all(u["unidade_id"] == norte["id"] for u in coord_norte.get("/api/v1/equipe").json())
            eu_geral = client.get("/api/v1/auth/eu").json()
            assert coord_norte.patch(f"/api/v1/equipe/{eu_geral['id']}", json={"ativo": False}).status_code == 404
            assert coord_norte.patch(f"/api/v1/equipe/{r.json()['id']}", json={"mudar_unidade": True, "unidade_id": None}).status_code == 403

            # atendente lê a configuração mas não edita
            login_at, _ = _conta(client, norte["id"], papel="ATENDENTE")
            atendente = _entrar(login_at, "senha-forte-1")
            assert atendente.get("/api/v1/configuracao/textos").status_code == 200
            assert atendente.put("/api/v1/configuracao/textos/retorno", json={"texto": "x"}).status_code == 403

            # não dá para remover CRAS com contas ligadas
            assert client.delete(f"/api/v1/configuracao/unidades/{norte['id']}").status_code == 422


def test_sistema_nunca_fica_sem_coordenacao_geral():
    with TestClient(app) as client:
        autenticar(client)
        with unidades(client, cras_teste()) as (norte,):
            eu = client.get("/api/v1/auth/eu").json()
            for u in client.get("/api/v1/equipe").json():
                if u["role"] == "ADMIN" and u["ativo"] and u["unidade_id"] is None and u["id"] != eu["id"]:
                    client.patch(f"/api/v1/equipe/{u['id']}", json={"ativo": False})
            r = client.patch(f"/api/v1/equipe/{eu['id']}", json={"mudar_unidade": True, "unidade_id": norte["id"]})
            assert r.status_code == 422 and "coordenação geral" in r.json()["detail"]
