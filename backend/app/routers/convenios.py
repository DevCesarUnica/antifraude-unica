from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.ConvenioResponse])
def listar_convenios(db: Session = Depends(get_db)):
    return db.query(models.Convenio).all()


@router.post("/", response_model=schemas.ConvenioResponse, status_code=201)
def criar_convenio(convenio_in: schemas.ConvenioCreate, db: Session = Depends(get_db)):
    existente = (
        db.query(models.Convenio).filter(models.Convenio.nome == convenio_in.nome).first()
    )
    if existente:
        raise HTTPException(status_code=400, detail="Convenio ja cadastrado")

    convenio = models.Convenio(**convenio_in.model_dump())
    db.add(convenio)
    db.commit()
    db.refresh(convenio)
    return convenio


@router.put("/{convenio_id}", response_model=schemas.ConvenioResponse)
def atualizar_convenio(
    convenio_id: int,
    convenio_in: schemas.ConvenioCreate,
    db: Session = Depends(get_db),
):
    convenio = db.query(models.Convenio).filter(models.Convenio.id == convenio_id).first()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convenio nao encontrado")

    for field, value in convenio_in.model_dump().items():
        setattr(convenio, field, value)

    db.commit()
    db.refresh(convenio)
    return convenio
