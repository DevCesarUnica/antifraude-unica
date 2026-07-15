"""
Router de convênios — catálogo de convênios reconhecidos pelo sistema.

Convênios podem ser cadastrados manualmente pela equipe ou registrados
automaticamente pelo motor antifraude quando encontra um novo.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Convenio
from app.schemas import ConvenioCreate, ConvenioOut, ConvenioUpdate, Mensagem

router = APIRouter(prefix="/convenios", tags=["convenios"])


@router.get("/", response_model=list[ConvenioOut])
def listar_convenios(
    ativo: bool | None = None,
    auto_registrado: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Convenio)
    if ativo is not None:
        q = q.filter(Convenio.ativo == ativo)
    if auto_registrado is not None:
        q = q.filter(Convenio.auto_registrado == auto_registrado)
    return q.order_by(Convenio.nome.asc()).all()


@router.post("/", response_model=ConvenioOut, status_code=status.HTTP_201_CREATED)
def criar_convenio(body: ConvenioCreate, db: Session = Depends(get_db)):
    convenio = Convenio(**body.model_dump(), auto_registrado=False)
    db.add(convenio)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Convênio já cadastrado com este nome")
    db.refresh(convenio)
    return convenio


@router.patch("/{convenio_id}", response_model=ConvenioOut)
def atualizar_convenio(convenio_id: str, body: ConvenioUpdate, db: Session = Depends(get_db)):
    convenio = _get_ou_404(db, convenio_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(convenio, campo, valor)
    db.commit()
    db.refresh(convenio)
    return convenio


@router.delete("/{convenio_id}", response_model=Mensagem)
def desativar_convenio(convenio_id: str, db: Session = Depends(get_db)):
    convenio = _get_ou_404(db, convenio_id)
    convenio.ativo = False
    db.commit()
    return Mensagem(mensagem="Convênio desativado com sucesso")


def _get_ou_404(db: Session, convenio_id: str) -> Convenio:
    c = db.query(Convenio).filter(Convenio.id == convenio_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")
    return c
