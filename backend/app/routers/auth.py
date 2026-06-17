"""
Autenticação JWT — login por e-mail ou username, verificação de token.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.database import get_db
from app.core.config import settings
from app.models import Usuario
from app.schemas import LoginRequest, TokenResponse, UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_ctx = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
bearer  = HTTPBearer()


def hash_senha(senha: str) -> str:
    return pwd_ctx.hash(senha)


def verificar_senha(senha: str, hash_: str) -> bool:
    return pwd_ctx.verify(senha, hash_)


def _gerar_token(usuario_id: str) -> str:
    payload = {
        "sub": usuario_id,
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def verificar_token(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    try:
        payload = jwt.decode(
            creds.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        usuario_id: str = payload.get("sub")
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.ativo == True).first()
        if not usuario:
            raise HTTPException(status_code=401, detail="Token inválido ou usuário inativo")
        return usuario
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expirado ou inválido")


def _seed_admin(db: Session) -> None:
    """Cria o admin padrão se não existir nenhum usuário."""
    if db.query(Usuario).count() == 0:
        admin = Usuario(
            email="admin@unica.com.br",
            username="admin",
            nome="Administrador",
            cargo="Administrador do Sistema",
            perfil="admin",
            senha_hash=hash_senha("admin123"),
            ativo=True,
        )
        db.add(admin)
        db.commit()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    _seed_admin(db)

    identificador = body.identificador.strip().lower()

    # Tenta por e-mail, depois por username
    usuario = (
        db.query(Usuario).filter(Usuario.email == identificador).first()
        or db.query(Usuario).filter(Usuario.username == identificador).first()
    )

    if not usuario or not usuario.ativo:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    if not verificar_senha(body.senha, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = _gerar_token(usuario.id)
    return TokenResponse(access_token=token, usuario=UsuarioOut.model_validate(usuario))


@router.get("/me", response_model=UsuarioOut)
def me(usuario: Usuario = Depends(verificar_token)):
    return UsuarioOut.model_validate(usuario)
