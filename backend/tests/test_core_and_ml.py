import pytest
from app.services.ml.classifier_service import SocialClassifierService
from app.services.rag.rag_service import social_rag_service
from app.services.ml.clustering_service import social_clustering_service
from app.services.audio.whisper_service import WhisperAudioService
from app.services.llm.gemini_service import gemini_service
from app.services.flow_engine.engine import flow_execution_engine
from app.api.v1.endpoints.flows import DEFAULT_FLOW_GRAPH
from app.core.security import hash_password, verify_password, create_access_token, decode_token, mask_phone, mask_cpf, encrypt_secret, decrypt_secret

def test_security_hashing():
    pwd = "minha_senha_secreta_2026"
    hashed = hash_password(pwd)
    assert verify_password(pwd, hashed) is True
    assert verify_password("senha_errada", hashed) is False

def test_jwt_tokens():
    token = create_access_token(subject="user-test-123", tenant_id="tenant-anapolis", role="ADMIN")
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user-test-123"
    assert payload["tenant_id"] == "tenant-anapolis"
    assert payload["role"] == "ADMIN"

def test_encryption_aes_256():
    plain = "whatsapp_api_token_super_secreto"
    encrypted = encrypt_secret(plain)
    assert encrypted != plain
    decrypted = decrypt_secret(encrypted)
    assert decrypted == plain

def test_lgpd_masking():
    phone = "5562988889999"
    masked_p = mask_phone(phone)
    assert "9****-" in masked_p

    cpf = "12345678901"
    masked_c = mask_cpf(cpf)
    assert masked_c == "***.456.789-**"

def test_social_classifier_violencia_urgencia():
    relato = "Meu marido está me ameaçando de morte e me agrediu com uma faca dentro de casa."
    res = SocialClassifierService.classify_relato(relato)
    assert res["categoria"] == "violencia_protecao"
    assert res["prioridade"] == "URGENTE_VIOLENCIA"
    assert res["is_urgente"] is True
    assert "190" in res["contato_util"]

def test_social_classifier_renda_beneficio():
    relato = "Estou desempregada e sem dinheiro para alimentar meus filhos, preciso me cadastrar no Bolsa Família."
    res = SocialClassifierService.classify_relato(relato)
    assert res["categoria"] == "renda_beneficio"
    assert len(res["documentos_necessarios"]) > 0
    assert "CRAS" in res["local_atendimento"]

def test_rag_service_search_jaiara():
    res = social_rag_service.search_relevant_unit("preciso de cesta basica", bairro="Vila Jaiara")
    assert res["unidade"]["tipo"] == "CRAS"
    assert "Vila Jaiara" in res["unidade"]["bairros_atendidos"]
    assert res["score_similaridade"] > 0

def test_clustering_unsupervised():
    relatos = [
        "preciso de bolsa familia e cesta basica",
        "sem comida para os filhos e sem dinheiro de renda",
        "preciso atualizar o cadastro unico da minha familia",
        "meu cadunico esta desatualizado ha 2 anos",
        "violencia domestica e ameaca dentro de casa",
        "agressao fisica urgente socorro delegacia"
    ]
    res = social_clustering_service.fit_and_cluster_relatos(relatos)
    assert res["status"] == "success"
    assert len(res["clusters"]) == 4
    assert len(res["scatter_points"]) == 6

@pytest.mark.asyncio
async def test_whisper_audio_service():
    res = await WhisperAudioService.transcribe_audio_file("fake_audio.ogg")
    assert res["status"] in ["success", "error"]
    assert "language" in res

@pytest.mark.asyncio
async def test_gemini_service():
    res = await gemini_service.generate_response("Você é um assistente social", "Olá")
    assert res["status"] in ["success", "fallback"]
    assert "content" in res

@pytest.mark.asyncio
async def test_flow_execution_engine_live():
    res = await flow_execution_engine.execute_graph(
        graph_data=DEFAULT_FLOW_GRAPH,
        input_text="Estou desempregado e passando fome com meus filhos, preciso de ajuda."
    )
    assert res["status"] == "success"
    assert res["total_nodes_executed"] > 0
    assert "execution_logs" in res
