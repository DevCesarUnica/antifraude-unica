from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.regras import processar_proposta

router = APIRouter()


@router.get("/summary", response_model=List[schemas.StatusCount])
def get_summary(db: Session = Depends(get_db)):
    """Retorna contagem e valor total agrupados por status."""
    rows = (
        db.query(
            models.Proposta.status,
            func.count(models.Proposta.id).label("quantidade"),
            func.coalesce(func.sum(models.Proposta.valor), 0.0).label("valor_total"),
        )
        .group_by(models.Proposta.status)
        .all()
    )
    return [
        schemas.StatusCount(
            status=row.status,
            quantidade=row.quantidade,
            valor_total=float(row.valor_total),
        )
        for row in rows
    ]


@router.get("/", response_model=List[schemas.PropostaResponse])
def listar_propostas(status: Optional[str] = None, db: Session = Depends(get_db)):
    """Lista todas as propostas, com filtro opcional por status."""
    query = db.query(models.Proposta)
    if status:
        query = query.filter(models.Proposta.status == status)
    return query.all()


@router.post("/importar", response_model=schemas.PropostaResponse, status_code=201)
def importar_proposta(proposta_in: schemas.PropostaCreate, db: Session = Depends(get_db)):
    """Cria uma proposta e aplica as regras de negocio automaticamente."""
    proposta = models.Proposta(**proposta_in.model_dump())
    db.add(proposta)
    db.flush()  # gera o id sem commitar, necessario para processar_proposta

    status = processar_proposta(proposta, db)
    proposta.status = status

    db.commit()
    db.refresh(proposta)
    return proposta


@router.put("/{proposta_id}/status", response_model=schemas.PropostaResponse)
def atualizar_status(
    proposta_id: int,
    update: schemas.PropostaStatusUpdate,
    db: Session = Depends(get_db),
):
    """Atualiza o status de uma proposta manualmente."""
    proposta = db.query(models.Proposta).filter(models.Proposta.id == proposta_id).first()
    if not proposta:
        raise HTTPException(status_code=404, detail="Proposta nao encontrada")

    proposta.status = update.status
    if update.observacao is not None:
        proposta.observacao = update.observacao

    db.commit()
    db.refresh(proposta)
    return proposta
