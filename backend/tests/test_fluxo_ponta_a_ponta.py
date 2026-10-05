"""Caminho principal: mensagem do cidadão → fluxo do bot → modelo → banco → fila do painel."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.anonimizacao import anonimizar_texto
from conftest import autenticar


def _conversa(client, telefone, *mensagens):
    respostas = []
    for texto in mensagens:
        r = client.post("/api/v1/webhooks/simular", json={"telefone": telefone, "texto": texto})
        assert r.status_code == 200
        respostas.append(r.json()["respostas"])
    return respostas


def _fila(client):
    return client.get("/api/v1/triagem/fila").json()


def test_fluxo_completo_entra_na_fila_com_dados_protegidos():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in _fila(client)}
        r = _conversa(
            client, "5562911110001",
            "oi",
            "1",
            "nao temos nada para comer em casa e meus filhos estao com fome, me liga no 62 99999-1234",
            "1",
            "1",
        )
        assert "concorda" in r[0][0]
        assert "Conte" in r[1][0] or "conte" in r[1][0]
        assert "alimentação" in r[2][0]
        assert "Documentos para levar" in r[3][0]
        assert "enviada para a equipe do CRAS" in r[4][0]

        novas = [t for t in _fila(client) if t["id"] not in antes]
        assert len(novas) == 1
        nova = novas[0]
        assert nova["canal"] == "whatsapp"
        assert nova["categoria"] == "alimentacao"
        assert nova["categoria_confirmada_pelo_cidadao"] is True
        assert "99999-1234" not in nova["relato_original"]
        assert "[telefone]" in nova["relato_original"]
        assert nova["telefone_mascarado"] == "62 9****-0001"


def test_recusar_contato_avisa_que_o_pedido_nao_chega_ao_cras():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in _fila(client)}
        r = _conversa(client, "5562911110009", "oi", "1", "perdi minha identidade e preciso tirar outra", "1", "talvez", "2")
        assert "não chega ao CRAS" in r[3][0]          # aviso antes de escolher
        assert "o CRAS não fica sabendo" in r[4][0]    # resposta inválida repete o aviso
        assert "não foi enviado" in r[5][0]
        assert not [t for t in _fila(client) if t["id"] not in antes]


def test_padrao_antigo_nao_editado_passa_para_o_novo():
    from sqlalchemy import select

    from app.db import abrir_sessao
    from app.models import TextoBot
    from app.services import catalogo

    async def trocar_e_recarregar(texto):
        async with abrir_sessao() as session:
            linha = (await session.execute(select(TextoBot).where(TextoBot.chave == "contato_recusado"))).scalar_one()
            linha.texto = texto
            await session.commit()
            await catalogo.carregar(session)
        return catalogo.texto("contato_recusado")

    with TestClient(app) as client:
        antigo = catalogo.TEXTOS_ANTIGOS["contato_recusado"][0]
        assert client.portal.call(trocar_e_recarregar, antigo) == catalogo.TEXTOS_PADRAO["contato_recusado"]["texto"]
        editado = "Texto escrito pela equipe."
        assert client.portal.call(trocar_e_recarregar, editado) == editado    # edição da equipe é mantida
        client.portal.call(trocar_e_recarregar, catalogo.TEXTOS_PADRAO["contato_recusado"]["texto"])


def test_correcao_pelo_cidadao_vira_exemplo_rotulado():
    with TestClient(app) as client:
        autenticar(client)
        _conversa(client, "5562911110002", "ola", "sim", "preciso de ajuda com o cadastro unico da minha familia", "2")
        # menu: 1 renda, 2 cadastro, 3 moradia, 4 documentação ...
        r = _conversa(client, "5562911110002", "4", "1")
        assert "Documentos para levar" in r[0][0]
        exemplos = client.get("/api/v1/triagem/exemplos-rotulados").json()
        assert any(e["categoria"] == "documentacao" and not e["modelo_acertou"] for e in exemplos)


def test_violencia_interrompe_em_qualquer_etapa():
    with TestClient(app) as client:
        autenticar(client)
        antes = {t["id"] for t in _fila(client)}
        r = _conversa(client, "5562911110003", "meu marido me agrediu e estou com medo")
        assert "190" in r[0][0] and "180" in r[0][0]
        urgente = next(t for t in _fila(client) if t["id"] not in antes)
        assert urgente["prioridade"] == "URGENTE_VIOLENCIA"
        assert urgente["status"] == "URGENTE_CREAS"


def test_fila_vem_com_urgentes_primeiro():
    with TestClient(app) as client:
        autenticar(client)
        ordem = {"URGENTE_VIOLENCIA": 0, "ALTA": 1, "MEDIA": 2}
        prioridades = [ordem.get(t["prioridade"], 3) for t in _fila(client)]
        assert prioridades == sorted(prioridades)


def test_sem_consentimento_nao_grava_nada():
    with TestClient(app) as client:
        autenticar(client)
        antes = len(_fila(client))
        r = _conversa(client, "5562911110004", "oi", "2")
        assert "121" in r[1][0]
        assert len(_fila(client)) == antes


def test_relato_curto_pede_mais_detalhes_uma_vez():
    with TestClient(app) as client:
        autenticar(client)
        r = _conversa(client, "5562911110005", "oi", "1", "ajuda")
        assert "um pouco mais" in r[2][0]


def test_mudar_status_no_painel():
    with TestClient(app) as client:
        autenticar(client)
        alvo = _fila(client)[0]["id"]
        r = client.patch(f"/api/v1/triagem/{alvo}/status", json={"status": "EM_ATENDIMENTO"})
        assert r.status_code == 200
        assert next(t for t in _fila(client) if t["id"] == alvo)["status"] == "EM_ATENDIMENTO"
        assert client.patch(f"/api/v1/triagem/{alvo}/status", json={"status": "QUALQUER"}).status_code == 422


def test_webhook_ignora_grupos_e_proprio_bot():
    with TestClient(app) as client:
        autenticar(client)
        base = {"event": "messages.upsert", "data": {"message": {"conversation": "oi"}}}
        grupo = {**base, "data": {**base["data"], "key": {"remoteJid": "123@g.us", "fromMe": False}}}
        proprio = {**base, "data": {**base["data"], "key": {"remoteJid": "5562@s.whatsapp.net", "fromMe": True}}}
        assert client.post("/api/v1/webhooks/evolution", json=grupo).json()["status"] == "ignored"
        assert client.post("/api/v1/webhooks/evolution", json=proprio).json()["status"] == "ignored"


def test_anonimizacao():
    texto = anonimizar_texto("me liga no (62) 99999-1234 ou manda email pra maria@gmail.com, cpf 12345678901")
    assert "99999" not in texto and "maria@" not in texto and "12345678901" not in texto


def test_nao_entendeu_pede_de_novo_e_depois_oferece_menu():
    with TestClient(app) as client:
        autenticar(client)
        r = _conversa(client, "5562911110010", "oi", "1", "zzz qwerty asdf hjkl", "zzz qwerty asdf hjkl")
        assert "121" in r[2][0]                      # 1ª vez: orienta e pede para contar de outro jeito
        assert "Nenhum desses" in r[3][0]             # 2ª vez: menu de assuntos
        fim = _conversa(client, "5562911110010", "9")[0][0]
        assert "121" in fim


def test_depois_de_nao_entender_a_conversa_continua():
    with TestClient(app) as client:
        autenticar(client)
        r = _conversa(client, "5562911110011", "oi", "1", "zzz qwerty asdf hjkl",
                      "nao temos nada para comer e o aluguel ta atrasado vamos ser despejados")
        assert "concorda" not in r[3][0]
        assert "Está certo?" in r[3][0]


def test_caminho_mostra_outras_necessidades_por_prioridade():
    from app.services.bot.fluxo_conversa import caminho_completo
    texto = caminho_completo("documentacao", ["trabalho_renda", "alimentacao", "documentacao", "violencia_protecao"])
    assert texto.index("alimentação") < texto.index("trabalho e cursos")  # ALTA antes de BAIXA
    assert texto.count("Você também falou de") == 2                        # sem repetir a principal nem violência
    assert texto.rstrip().endswith("você precisa ir até lá")              # pergunta de contato fecha a mensagem


def test_apagar_dados_remove_conversa_e_triagem():
    with TestClient(app) as client:
        autenticar(client)
        tel = "5562911110012"
        antes = {t["id"] for t in _fila(client)}
        _conversa(client, tel, "oi", "1", "nao temos nada para comer em casa e meus filhos estao com fome", "1", "1")
        nova = [t for t in _fila(client) if t["id"] not in antes]
        assert len(nova) == 1
        conversa_id = nova[0]["conversa_id"]

        pede, cancela = _conversa(client, tel, "apagar", "2")
        assert "não pode ser desfeito" in pede[0] and "nada foi apagado" in cancela[0]
        assert any(t["id"] == nova[0]["id"] for t in _fila(client))

        r = _conversa(client, tel, "apagar meus dados", "1")
        assert "apagados" in r[1][0]
        assert not any(t["id"] == nova[0]["id"] for t in _fila(client))
        assert not any(c["id"] == conversa_id for c in client.get("/api/v1/atendimento/conversas").json())
        # recomeça do zero, pedindo consentimento de novo
        assert "concorda" in _conversa(client, tel, "oi")[0][0]


def test_apagar_mantem_caso_urgente_de_violencia_aberto():
    with TestClient(app) as client:
        autenticar(client)
        tel = "5562911110013"
        antes = {t["id"] for t in _fila(client)}
        _conversa(client, tel, "meu marido me agrediu e estou com medo")
        urgente = next(t for t in _fila(client) if t["id"] not in antes)
        r = _conversa(client, tel, "apagar", "1")
        assert "continua com a equipe" in r[1][0]
        assert any(t["id"] == urgente["id"] for t in _fila(client))


def test_recomecar_e_retorno_sem_pedir_consentimento_de_novo():
    with TestClient(app) as client:
        autenticar(client)
        tel = "5562911110014"
        r = _conversa(client, tel, "oi", "1", "preciso tirar a segunda via da minha certidao de nascimento", "recomeçar")
        assert "conte" in r[3][0].lower()
        r = _conversa(client, tel, "preciso tirar a segunda via da minha certidao de nascimento", "1", "2", "obrigado")
        assert "De nada" in r[3][0]
        volta = _conversa(client, tel, "bom dia")[0][0]
        assert "de novo" in volta and "concorda" not in volta
