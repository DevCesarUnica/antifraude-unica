from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.GrupoResponse])
def listar_grupos(db: Session = Depends(get_db)):
    return db.query(models.Grupo).all()


@router.post("/", response_model=schemas.GrupoResponse, status_code=201)
def criar_grupo(grupo_in: schemas.GrupoCreate, db: Session = Depends(get_db)):
    existente = db.query(models.Grupo).filter(models.Grupo.nome == grupo_in.nome).first()
    if existente:
        raise HTTPException(status_code=400, detail="Grupo ja cadastrado")

    grupo = models.Grupo(**grupo_in.model_dump())
    db.add(grupo)
    db.commit()
    db.refresh(grupo)
    return grupo
