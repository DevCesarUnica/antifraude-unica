from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.routers.auth import get_current_user, hash_password, require_role, _ROLE_CARGO

router = APIRouter()

VALID_ROLES = {"ADMIN", "GESTOR", "ANALISTA", "OPERADOR"}


@router.get("/", response_model=List[schemas.UserResponse])
def listar_usuarios(
    _: models.User = Depends(require_role(["ADMIN", "GESTOR"])),
    db: Session = Depends(get_db),
):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("/", response_model=schemas.UserResponse, status_code=201)
def criar_usuario(
    user_in: schemas.UserCreate,
    _: models.User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
):
    if user_in.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Role inválida")
    if db.query(models.User).filter(models.User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username já cadastrado")
    if user_in.email:
        if db.query(models.User).filter(models.User.email == user_in.email).first():
            raise HTTPException(status_code=400, detail="Email já cadastrado")

    user = models.User(
        username=user_in.username,
        email=user_in.email or None,
        password_hash=hash_password(user_in.password),
        nome=user_in.nome,
        role=user_in.role,
        cargo=_ROLE_CARGO.get(user_in.role, user_in.role.capitalize()),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=schemas.UserResponse)
def atualizar_usuario(
    user_id: int,
    user_in: schemas.UserUpdate,
    current_user: models.User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    data = user_in.model_dump(exclude_none=True)
    if "password" in data:
        user.password_hash = hash_password(data.pop("password"))
    if "role" in data:
        if data["role"] not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Role inválida")
        user.cargo = _ROLE_CARGO.get(data["role"], data["role"].capitalize())
    if "email" in data and data["email"]:
        existing = db.query(models.User).filter(
            models.User.email == data["email"], models.User.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email já cadastrado")
    for field, value in data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=schemas.UserResponse)
def toggle_status(
    user_id: int,
    current_user: models.User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não é possível alterar o próprio status")

    user.ativo = not user.ativo
    if not user.ativo:
        user.token = None
    db.commit()
    db.refresh(user)
    return user
