from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.BlacklistResponse])
def listar_blacklist(db: Session = Depends(get_db)):
    return db.query(models.Blacklist).all()


@router.post("/", response_model=schemas.BlacklistResponse, status_code=201)
def adicionar_blacklist(entry_in: schemas.BlacklistCreate, db: Session = Depends(get_db)):
    existente = (
        db.query(models.Blacklist).filter(models.Blacklist.cpf == entry_in.cpf).first()
    )
    if existente:
        raise HTTPException(status_code=400, detail="CPF ja consta na blacklist")

    entry = models.Blacklist(**entry_in.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def remover_blacklist(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.Blacklist).filter(models.Blacklist.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada nao encontrada na blacklist")

    db.delete(entry)
    db.commit()
