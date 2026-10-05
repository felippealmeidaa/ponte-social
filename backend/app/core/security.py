import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import jwt
from cryptography.fernet import Fernet
from app.core.config import settings

# --------------------------------------------------------------------------
# 1. Criptografia Simétrica AES-256 (Fernet) para tokens e chaves de WhatsApp
# --------------------------------------------------------------------------
def get_fernet_cipher() -> Fernet:
    # Garante chave compatível com Fernet (32 bytes base64 url-safe)
    key = settings.ENCRYPTION_SECRET_KEY.encode()
    if len(key) != 44:
        # Gera uma chave baseada no hash se o tamanho for diferente
        key = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
    return Fernet(key)

def encrypt_secret(plain_text: str) -> str:
    if not plain_text:
        return ""
    cipher = get_fernet_cipher()
    return cipher.encrypt(plain_text.encode()).decode()

def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        cipher = get_fernet_cipher()
        return cipher.decrypt(cipher_text.encode()).decode()
    except Exception:
        return ""

# --------------------------------------------------------------------------
# 2. Hash de Senhas Seguro (Argon2id com fallback SHA-256 com Salt dinâmico)
# --------------------------------------------------------------------------
try:
    from argon2 import PasswordHasher
    _ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
    
    def hash_password(password: str) -> str:
        return _ph.hash(password)

    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            return _ph.verify(hashed_password, plain_password)
        except Exception:
            return False
except ImportError:
    # Fallback seguro com HMAC + Salt
    def hash_password(password: str) -> str:
        salt = os.urandom(16).hex()
        pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()
        return f"pbkdf2_sha256${salt}${pwd_hash}"

    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            algorithm, salt, pwd_hash = hashed_password.split('$')
            check = hashlib.pbkdf2_hmac('sha256', plain_password.encode(), salt.encode(), 100000).hex()
            return hmac.compare_digest(pwd_hash, check)
        except Exception:
            return False

# --------------------------------------------------------------------------
# 3. JWT Tokens (Access Token e Refresh Token)
# --------------------------------------------------------------------------
def create_access_token(subject: str | Any, tenant_id: str = "tenant-default", role: str = "ADMIN", expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "sub": str(subject),
        "tenant_id": tenant_id,
        "role": role,
        "exp": expire,
        "iat": datetime.utcnow()
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: str | Any, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "sub": str(subject),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except Exception:
        return None

# --------------------------------------------------------------------------
# 4. Anonimização e Higienização LGPD
# --------------------------------------------------------------------------
def mask_phone(phone: str) -> str:
    digits = ''.join(c for c in phone if c.isdigit())
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]  # remove o código do país para mostrar o DDD
    if len(digits) >= 10:
        return f"{digits[:2]} 9****-{digits[-4:]}"
    return "****-****"

def mask_cpf(cpf: str) -> str:
    digits = ''.join(c for c in cpf if c.isdigit())
    if len(digits) == 11:
        return f"***.{digits[3:6]}.{digits[6:9]}-**"
    return "***.***.***-**"
