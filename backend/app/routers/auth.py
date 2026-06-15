import hashlib
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()

_ROLE_CARGO = {
    "ADMIN": "Administrador",
    "GESTOR": "Gestor",
    "ANALISTA": "Analista",
    "OPERADOR": "Operador",
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token não fornecido")
    token = authorization.removeprefix("Bearer ").strip()
    user = db.query(models.User).filter(models.User.token == token, models.User.ativo == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado")
    return user


def require_role(roles: list):
    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Sem permissão para esta ação")
        return current_user
    return checker


@router.post("/login", response_model=schemas.LoginResponse)
def login(credentials: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(
            or_(
                models.User.username == credentials.username,
                models.User.email == credentials.username,
            ),
            models.User.ativo == True,
        )
        .first()
    )
    if not user or user.password_hash != hash_password(credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos",
        )
    user.token = str(uuid.uuid4())
    db.commit()
    return {
        "access_token": user.token,
        "username": user.username,
        "nome": user.nome,
        "cargo": user.cargo,
        "role": user.role,
    }


@router.post("/logout")
def logout(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.token = None
    db.commit()
    return {"message": "Logout realizado com sucesso"}


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
