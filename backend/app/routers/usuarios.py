"""
Gestão de usuários — apenas admins e gestores podem acessar.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Usuario
from app.schemas import UsuarioCreate, UsuarioUpdate, UsuarioOut
from app.routers.auth import verificar_token, hash_senha

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


def _exige_admin_ou_gestor(atual: Usuario = Depends(verificar_token)) -> Usuario:
    if atual.perfil not in ("admin", "gestor"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    return atual


@router.get("/", response_model=list[UsuarioOut])
def listar(
    db: Session = Depends(get_db),
    _: Usuario = Depends(_exige_admin_ou_gestor),
):
    return db.query(Usuario).order_by(Usuario.nome).all()


@router.post("/", response_model=UsuarioOut, status_code=201)
def criar(
    body: UsuarioCreate,
    db: Session = Depends(get_db),
    atual: Usuario = Depends(_exige_admin_ou_gestor),
):
    if db.query(Usuario).filter(Usuario.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    if db.query(Usuario).filter(Usuario.username == body.username.lower()).first():
        raise HTTPException(status_code=400, detail="Username já cadastrado")

    usuario = Usuario(
        email=body.email.lower(),
        username=body.username.lower(),
        nome=body.nome,
        cargo=body.cargo,
        perfil=body.perfil,
        senha_hash=hash_senha(body.senha),
        ativo=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def atualizar(
    usuario_id: str,
    body: UsuarioUpdate,
    db: Session = Depends(get_db),
    atual: Usuario = Depends(_exige_admin_ou_gestor),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Admin não pode ser desativado por gestor
    if usuario.perfil == "admin" and atual.perfil != "admin":
        raise HTTPException(status_code=403, detail="Apenas admin pode alterar outro admin")

    if body.nome is not None:
        usuario.nome = body.nome
    if body.cargo is not None:
        usuario.cargo = body.cargo
    if body.perfil is not None:
        usuario.perfil = body.perfil
    if body.ativo is not None:
        usuario.ativo = body.ativo
    if body.senha is not None:
        usuario.senha_hash = hash_senha(body.senha)

    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.delete("/{usuario_id}", status_code=204)
def desativar(
    usuario_id: str,
    db: Session = Depends(get_db),
    atual: Usuario = Depends(_exige_admin_ou_gestor),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if usuario.id == atual.id:
        raise HTTPException(status_code=400, detail="Não é possível desativar a si mesmo")
    usuario.ativo = False
    db.commit()


@router.delete("/{usuario_id}/excluir", status_code=204)
def excluir(
    usuario_id: str,
    db: Session = Depends(get_db),
    atual: Usuario = Depends(_exige_admin_ou_gestor),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if usuario.id == atual.id:
        raise HTTPException(status_code=400, detail="Não é possível excluir a si mesmo")
    if usuario.perfil == "admin" and atual.perfil != "admin":
        raise HTTPException(status_code=403, detail="Apenas admin pode excluir outro admin")
    db.delete(usuario)
    db.commit()
