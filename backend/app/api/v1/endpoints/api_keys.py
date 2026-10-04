import secrets
import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

router = APIRouter()

# Armazenamento em memória de API Keys
API_KEYS_DB: List[Dict[str, Any]] = [
    {
        "id": "key_prod_01",
        "name": "Chave Produção CRM WhatsApp",
        "key_prefix": "sk_live_cras",
        "full_key": "sk_live_cras_8f93a02bb14798e2194c",
        "app_id": "social-cras",
        "created_at": "2026-10-01 10:00:00",
        "last_used": "Hoje às 02:25",
        "requests_count": 1420,
        "status": "active"
    },
    {
        "id": "key_dev_02",
        "name": "Chave de Testes Locais / SDK",
        "key_prefix": "sk_test_dev",
        "full_key": "sk_test_dev_5e11c88db90a34f71a01",
        "app_id": "licitacao-anapolis",
        "created_at": "2026-10-03 14:30:00",
        "last_used": "Hoje às 01:10",
        "requests_count": 87,
        "status": "active"
    }
]

class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., description="Nome de identificação da chave")
    app_id: str = Field("social-cras", description="ID do App/Workspace associado")

class RevokeApiKeyRequest(BaseModel):
    key_id: str

@router.get("", summary="Listar todas as API Keys do Workspace")
async def list_api_keys():
    return {
        "keys": API_KEYS_DB,
        "total": len(API_KEYS_DB)
    }

@router.post("", summary="Criar nova API Key (sk_live_...)")
async def create_api_key(req: CreateApiKeyRequest):
    random_hex = secrets.token_hex(12)
    full_key = f"sk_live_{req.app_id[:6]}_{random_hex}"
    
    new_entry = {
        "id": f"key_{secrets.token_hex(4)}",
        "name": req.name,
        "key_prefix": f"sk_live_{req.app_id[:6]}",
        "full_key": full_key,
        "app_id": req.app_id,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "last_used": "Nunca utilizada",
        "requests_count": 0,
        "status": "active"
    }
    
    API_KEYS_DB.insert(0, new_entry)
    return {
        "success": True,
        "message": "Chave de API gerada com sucesso. Armazene-a com segurança!",
        "key": new_entry
    }

@router.delete("/{key_id}", summary="Revogar uma API Key")
async def revoke_api_key(key_id: str):
    for k in API_KEYS_DB:
        if k["id"] == key_id:
            k["status"] = "revoked"
            return {"success": True, "message": f"Chave {key_id} revogada com sucesso."}
    raise HTTPException(status_code=404, detail="Chave não encontrada.")
