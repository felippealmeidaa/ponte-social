from fastapi import APIRouter, HTTPException, status, Response, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter()

# Banco de dados de usuários pré-configurados
USERS_DB = {
    "teste": {
        "id": "usr-teste",
        "name": "Administrador de Teste",
        "email": "teste@cras.gov.br",
        "username": "teste",
        "password_hash": hash_password("123"),
        "role": "ADMIN",
        "tenant_id": "cras-anapolis-01"
    },
    "teste@cras.gov.br": {
        "id": "usr-teste",
        "name": "Administrador de Teste",
        "email": "teste@cras.gov.br",
        "username": "teste",
        "password_hash": hash_password("123"),
        "role": "ADMIN",
        "tenant_id": "cras-anapolis-01"
    },
    "admin@cras.gov.br": {
        "id": "usr-01",
        "name": "Coordenador CRAS",
        "email": "admin@cras.gov.br",
        "username": "admin",
        "password_hash": hash_password("admin123"),
        "role": "ADMIN",
        "tenant_id": "cras-anapolis-01"
    },
    "atendente@cras.gov.br": {
        "id": "usr-02",
        "name": "Assistente Social - Triagem",
        "email": "atendente@cras.gov.br",
        "username": "atendente",
        "password_hash": hash_password("senha123"),
        "role": "ATENDENTE",
        "tenant_id": "cras-anapolis-01"
    }
}

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, response: Response):
    user = USERS_DB.get(credentials.username_or_email.strip())
    
    # Se não achar por chave direta, tenta encontrar por username ou email
    if not user:
        user = next((
            u for u in USERS_DB.values()
            if u["email"].lower() == credentials.username_or_email.lower() or
               u["username"].lower() == credentials.username_or_email.lower()
        ), None)

    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas. Use o login 'teste' e senha '123'."
        )
    
    access_token = create_access_token(
        subject=user["id"],
        tenant_id=user["tenant_id"],
        role=user["role"]
    )
    refresh_token = create_refresh_token(subject=user["id"])
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/api/v1/auth/refresh",
        max_age=7 * 24 * 60 * 60
    )
    
    user_info = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "tenant_id": user["tenant_id"]
    }
    
    return {"access_token": access_token, "token_type": "bearer", "user": user_info}

@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token ausente")
    
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido ou expirado")
    
    user_id = payload.get("sub")
    user = next((u for u in USERS_DB.values() if u["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    
    new_access_token = create_access_token(
        subject=user["id"],
        tenant_id=user["tenant_id"],
        role=user["role"]
    )
    return {"access_token": new_access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/v1/auth/refresh")
    return {"message": "Logout realizado com sucesso"}
