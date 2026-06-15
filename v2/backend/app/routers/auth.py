"""
Autenticação JWT — login e verificação de token.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.database import get_db
from app.core.config import settings
from app.schemas import LoginRequest, TokenResponse, UsuarioCreate, UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer()

# Modelo simplificado de usuário (sem tabela separada para não complicar o MVP v2)
# Em produção: criar tabela Usuario com SQLAlchemy

_USUARIOS_MOCK: dict[str, dict] = {
    "admin@unica.com.br": {
        "id": "1",
        "email": "admin@unica.com.br",
        "nome": "Administrador",
        "perfil": "admin",
        "ativo": True,
        "senha_hash": pwd_ctx.hash("admin123"),
    },
    "operador@unica.com.br": {
        "id": "2",
        "email": "operador@unica.com.br",
        "nome": "Operador Mesa",
        "perfil": "operador",
        "ativo": True,
        "senha_hash": pwd_ctx.hash("op123"),
    },
}


def _gerar_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def verificar_token(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm])
        email: str = payload.get("sub")
        usuario = _USUARIOS_MOCK.get(email)
        if not usuario or not usuario["ativo"]:
            raise HTTPException(status_code=401, detail="Token inválido")
        return usuario
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expirado ou inválido")


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    usuario = _USUARIOS_MOCK.get(body.email)
    if not usuario or not pwd_ctx.verify(body.senha, usuario["senha_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = _gerar_token(body.email)
    return TokenResponse(
        access_token=token,
        usuario=UsuarioOut(**{k: v for k, v in usuario.items() if k != "senha_hash"}),
    )


@router.get("/me", response_model=UsuarioOut)
def me(usuario: dict = Depends(verificar_token)):
    return UsuarioOut(**{k: v for k, v in usuario.items() if k != "senha_hash"})
