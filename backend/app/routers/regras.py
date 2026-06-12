from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.RegraGrupoResponse])
def listar_regras(db: Session = Depends(get_db)):
    return db.query(models.RegraGrupo).all()


@router.post("/", response_model=schemas.RegraGrupoResponse, status_code=201)
def criar_regra(regra_in: schemas.RegraGrupoCreate, db: Session = Depends(get_db)):
    grupo = db.query(models.Grupo).filter(models.Grupo.id == regra_in.grupo_id).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo nao encontrado")

    regra = models.RegraGrupo(**regra_in.model_dump())
    db.add(regra)
    db.commit()
    db.refresh(regra)
    return regra
