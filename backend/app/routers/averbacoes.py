"""
Router de averbações — registro formal de propostas no banco/convênio.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Averbacao, Proposta, StatusAverbacao, Usuario
from app.routers.auth import verificar_token
from app.schemas import AverbacaoCreate, AverbacaoUpdate, AverbacaoOut, Mensagem
from app.services.auditoria import log_auditoria

router = APIRouter(prefix="/averbacoes", tags=["averbacoes"])


@router.get("/", response_model=list[AverbacaoOut])
def listar_averbacoes(
    status_av: str | None = None,
    banco: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Averbacao)
    if status_av:
        q = q.filter(Averbacao.status == status_av.upper())
    if banco:
        q = q.filter(Averbacao.banco.ilike(f"%{banco}%"))
    return q.order_by(Averbacao.criado_em.desc()).offset(skip).limit(limit).all()


@router.post("/propostas/{proposta_id}", response_model=AverbacaoOut, status_code=status.HTTP_201_CREATED)
def averbar_proposta(
    proposta_id: str,
    body: AverbacaoCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    proposta = db.query(Proposta).filter(Proposta.id == proposta_id).first()
    if not proposta:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")

    averbacao = Averbacao(proposta_id=proposta_id, **body.model_dump())
    db.add(averbacao)
    db.flush()
    log_auditoria(
        db, acao=f"Criou averbação para proposta {proposta_id}", usuario=usuario, request=request,
        tipo_entidade="averbacao", entidade_id=averbacao.id, depois=body.model_dump(mode="json"), risco="MEDIO",
    )
    db.commit()
    db.refresh(averbacao)
    return averbacao


@router.get("/propostas/{proposta_id}", response_model=list[AverbacaoOut])
def listar_averbacoes_proposta(proposta_id: str, db: Session = Depends(get_db)):
    return db.query(Averbacao).filter(Averbacao.proposta_id == proposta_id).all()


@router.patch("/{averbacao_id}", response_model=AverbacaoOut)
def atualizar_averbacao(
    averbacao_id: str,
    body: AverbacaoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    av = _get_ou_404(db, averbacao_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(av, campo, valor)
    if body.status == StatusAverbacao.AVERBADO and not av.data_averbacao:
        av.data_averbacao = datetime.now(timezone.utc)
    log_auditoria(
        db, acao=f"Atualizou averbação {averbacao_id}", usuario=usuario, request=request,
        tipo_entidade="averbacao", entidade_id=averbacao_id, depois=body.model_dump(exclude_none=True, mode="json"), risco="MEDIO",
    )
    db.commit()
    db.refresh(av)
    return av


@router.post("/{averbacao_id}/confirmar", response_model=AverbacaoOut)
def confirmar_averbacao(
    averbacao_id: str,
    request: Request,
    numero_operacao: str | None = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    av = _get_ou_404(db, averbacao_id)
    av.status = StatusAverbacao.AVERBADO
    av.data_averbacao = datetime.now(timezone.utc)
    if numero_operacao:
        av.numero_operacao = numero_operacao
    log_auditoria(
        db, acao=f"Confirmou averbação {averbacao_id}", usuario=usuario, request=request,
        tipo_entidade="averbacao", entidade_id=averbacao_id,
        depois={"numero_operacao": numero_operacao}, risco="MEDIO",
    )
    db.commit()
    db.refresh(av)
    return av


@router.post("/{averbacao_id}/cancelar", response_model=AverbacaoOut)
def cancelar_averbacao(
    averbacao_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    av = _get_ou_404(db, averbacao_id)
    av.status = StatusAverbacao.CANCELADO
    log_auditoria(
        db, acao=f"Cancelou averbação {averbacao_id}", usuario=usuario, request=request,
        tipo_entidade="averbacao", entidade_id=averbacao_id, risco="ALTO",
    )
    db.commit()
    db.refresh(av)
    return av


def _get_ou_404(db: Session, averbacao_id: str) -> Averbacao:
    av = db.query(Averbacao).filter(Averbacao.id == averbacao_id).first()
    if not av:
        raise HTTPException(status_code=404, detail="Averbação não encontrada")
    return av
