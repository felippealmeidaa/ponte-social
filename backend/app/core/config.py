import secrets
import warnings
from pathlib import Path
from typing import List, Union
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Raiz do repositório (onde fica o .env), independente do diretório de execução
ROOT_DIR = Path(__file__).resolve().parents[3]

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

    # Segredos: NUNCA coloque valores reais aqui. Defina no arquivo .env (fora do git).
    # JWT
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    # Um turno de trabalho: o painel fica aberto o dia todo no CRAS
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AES-256 Fernet Encryption
    ENCRYPTION_SECRET_KEY: str = ""

    # Evolution API v2 (WhatsApp não-oficial)
    EVOLUTION_API_URL: str = "http://localhost:8080"
    EVOLUTION_API_KEY: str = ""

    # Meta Cloud API (WhatsApp Oficial)
    META_API_VERSION: str = "v20.0"
    META_WHATSAPP_TOKEN: str = ""
    META_PHONE_NUMBER_ID: str = ""
    META_WEBHOOK_VERIFY_TOKEN: str = ""

    # Banco de dados: Postgres do Docker (postgresql+asyncpg://...) ou, sem configuração, SQLite local
    DATABASE_URL: str = ""
    # LGPD: triagens mais antigas que isso são apagadas na inicialização da API
    RETENCAO_DIAS: int = 180
    # Conversa parada há mais tempo que isso recomeça do início
    CONVERSA_EXPIRA_MIN: int = 120
    EVOLUTION_INSTANCE_NAME: str = "cras-anapolis"

    # Protótipos da fase 2 (Flow Builder, AI Gateway, API Keys, RAG, Workspaces): desligados por padrão
    HABILITAR_FASE2: bool = False

    # Google Gemini LLM API
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    @model_validator(mode="after")
    def check_required_secrets(self) -> "Settings":
        missing = [name for name in ("SECRET_KEY", "ENCRYPTION_SECRET_KEY") if not getattr(self, name)]
        if not missing:
            return self
        if self.ENVIRONMENT != "development":
            raise ValueError(f"Defina {', '.join(missing)} no .env antes de rodar em {self.ENVIRONMENT}.")
        # Em desenvolvimento, gera chaves temporárias (tokens deixam de valer ao reiniciar)
        for name in missing:
            setattr(self, name, secrets.token_urlsafe(32))
        warnings.warn(f"{', '.join(missing)} ausente(s) no .env: usando chave temporária de desenvolvimento.")
        return self

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=(ROOT_DIR / ".env", ".env"),
        extra="ignore"
    )

settings = Settings()
