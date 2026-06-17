"""
Router de regras antifraude — CRUD com versionamento automático.

Toda atualização incrementa o campo `versao` da regra.
Regras deletadas são desativadas (ativo=False), nunca removidas do banco.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RegraAntifraude
from app.schemas import RegraCreate, RegraUpdate, RegraOut, Mensagem

router = APIRouter(prefix="/regras", tags=["regras"])


@router.get("/", response_model=list[RegraOut])
def listar_regras(ativo: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(RegraAntifraude)
    if ativo is not None:
        q = q.filter(RegraAntifraude.ativo == ativo)
    return q.order_by(RegraAntifraude.prioridade.asc()).all()


@router.post("/", response_model=RegraOut, status_code=201)
def criar_regra(body: RegraCreate, db: Session = Depends(get_db)):
    regra = RegraAntifraude(**body.model_dump())
    db.add(regra)
    db.commit()
    db.refresh(regra)
    return regra


@router.get("/{regra_id}", response_model=RegraOut)
def obter_regra(regra_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, regra_id)


@router.patch("/{regra_id}", response_model=RegraOut)
def atualizar_regra(regra_id: str, body: RegraUpdate, db: Session = Depends(get_db)):
    regra = _get_ou_404(db, regra_id)
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(regra, campo, valor)
    regra.versao = (regra.versao or 1) + 1
    db.commit()
    db.refresh(regra)
    return regra


@router.delete("/{regra_id}", response_model=Mensagem)
def desativar_regra(regra_id: str, db: Session = Depends(get_db)):
    """Desativa a regra (soft-delete) sem remover do histórico."""
    regra = _get_ou_404(db, regra_id)
    regra.ativo = False
    regra.versao = (regra.versao or 1) + 1
    db.commit()
    return Mensagem(mensagem=f"Regra '{regra.nome}' desativada")


def _get_ou_404(db: Session, regra_id: str) -> RegraAntifraude:
    r = db.query(RegraAntifraude).filter(RegraAntifraude.id == regra_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    return r
