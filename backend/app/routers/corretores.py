from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.CorretorResponse])
def listar_corretores(db: Session = Depends(get_db)):
    return db.query(models.Corretor).all()


@router.post("/", response_model=schemas.CorretorResponse, status_code=201)
def criar_corretor(corretor_in: schemas.CorretorCreate, db: Session = Depends(get_db)):
    existente = (
        db.query(models.Corretor).filter(models.Corretor.cpf == corretor_in.cpf).first()
    )
    if existente:
        raise HTTPException(status_code=400, detail="CPF ja cadastrado")

    corretor = models.Corretor(**corretor_in.model_dump())
    db.add(corretor)
    db.commit()
    db.refresh(corretor)
    return corretor


@router.put("/{corretor_id}/grupo", response_model=schemas.CorretorResponse)
def atualizar_grupo(
    corretor_id: int,
    grupo_id: int,
    db: Session = Depends(get_db),
):
    """Vincula ou altera o grupo de um corretor."""
    corretor = db.query(models.Corretor).filter(models.Corretor.id == corretor_id).first()
    if not corretor:
        raise HTTPException(status_code=404, detail="Corretor nao encontrado")

    if grupo_id:
        grupo = db.query(models.Grupo).filter(models.Grupo.id == grupo_id).first()
        if not grupo:
            raise HTTPException(status_code=404, detail="Grupo nao encontrado")

    corretor.grupo_id = grupo_id
    db.commit()
    db.refresh(corretor)
    return corretor
