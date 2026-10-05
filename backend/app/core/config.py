import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "CRM Inteligente de Encaminhamento Social"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["*"]
    
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "crm_social_secret_key_jwt_super_segura_2026_dev")
    ALGORITHM: str = "HS256"
    # Um turno de trabalho: o painel fica aberto o dia todo no CRAS
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # AES-256 Fernet Encryption
    ENCRYPTION_SECRET_KEY: str = os.getenv("ENCRYPTION_SECRET_KEY", "dGVzdGVfc2VjcmV0X2tleV9hZXNfMjU2X2Zvcl9jcm1fMjAyNg==")
    
    # Evolution API v2 (WhatsApp não-oficial)
    EVOLUTION_API_URL: str = os.getenv("EVOLUTION_API_URL", "http://localhost:8080")
    EVOLUTION_API_KEY: str = os.getenv("EVOLUTION_API_KEY", "CRM_EVOLUTION_SECRET_KEY_2026")
    
    # Meta Cloud API (WhatsApp Oficial)
    META_API_VERSION: str = os.getenv("META_API_VERSION", "v20.0")
    META_WHATSAPP_TOKEN: str = os.getenv("META_WHATSAPP_TOKEN", "")
    META_PHONE_NUMBER_ID: str = os.getenv("META_PHONE_NUMBER_ID", "")
    META_WEBHOOK_VERIFY_TOKEN: str = os.getenv("META_WEBHOOK_VERIFY_TOKEN", "meu_token_de_verificacao_meta_crm_2026")

    # Banco de dados: Postgres do Docker (postgresql+asyncpg://...) ou, sem configuração, SQLite local
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    # LGPD: triagens mais antigas que isso são apagadas na inicialização da API
    RETENCAO_DIAS: int = int(os.getenv("RETENCAO_DIAS", "180"))
    # Conversa parada há mais tempo que isso recomeça do início
    CONVERSA_EXPIRA_MIN: int = int(os.getenv("CONVERSA_EXPIRA_MIN", "120"))
    EVOLUTION_INSTANCE_NAME: str = os.getenv("EVOLUTION_INSTANCE_NAME", "cras-anapolis")

    # Google Gemini LLM API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore"
    )

settings = Settings()
