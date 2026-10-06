import pytest
from app.services.ml.classifier_service import SocialClassifierService
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
