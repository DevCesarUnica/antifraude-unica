"""
Router de pendências — painel de pendências operacionais.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Pendencia
from app.schemas import PendenciaCreate, PendenciaUpdate, PendenciaOut, PendenciaSummary, Mensagem

router = APIRouter(prefix="/pendencias", tags=["pendencias"])


# Rota estática — precisa vir antes de /{pendencia_id} (FastAPI casa por ordem de declaração).
@router.get("/summary", response_model=PendenciaSummary)
def resumo_pendencias(db: Session = Depends(get_db)):
    total = db.query(Pendencia).count()
    resolvidas = db.query(Pendencia).filter(Pendencia.resolvida == True).count()  # noqa: E712
    abertas = total - resolvidas
    taxa = (resolvidas / total * 100) if total > 0 else 0.0
    return PendenciaSummary(abertas=abertas, resolvidas=resolvidas, total=total, taxa_resolucao=round(taxa, 1))


@router.get("/", response_model=list[PendenciaOut])
def listar_pendencias(
    tipo: str | None = None,
    resolvida: bool | None = None,
    responsavel_id: str | None = None,
    proposta_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Pendencia)
    if tipo:
        q = q.filter(Pendencia.tipo == tipo.upper())
    if resolvida is not None:
        q = q.filter(Pendencia.resolvida == resolvida)
    if responsavel_id:
        q = q.filter(Pendencia.responsavel_id == responsavel_id)
    if proposta_id:
        q = q.filter(Pendencia.proposta_id == proposta_id)
    return q.order_by(Pendencia.criado_em.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=PendenciaOut, status_code=status.HTTP_201_CREATED)
def criar_pendencia(body: PendenciaCreate, db: Session = Depends(get_db)):
    pendencia = Pendencia(**body.model_dump())
    db.add(pendencia)
    db.commit()
    db.refresh(pendencia)
    return pendencia


@router.get("/{pendencia_id}", response_model=PendenciaOut)
def obter_pendencia(pendencia_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, pendencia_id)


@router.patch("/{pendencia_id}", response_model=PendenciaOut)
def atualizar_pendencia(pendencia_id: str, body: PendenciaUpdate, db: Session = Depends(get_db)):
    p = _get_ou_404(db, pendencia_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(p, campo, valor)
    if body.resolvida and not p.resolvida_em:
        p.resolvida_em = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return p


@router.post("/{pendencia_id}/resolver", response_model=PendenciaOut)
def resolver_pendencia(pendencia_id: str, resolucao: str | None = None, db: Session = Depends(get_db)):
    p = _get_ou_404(db, pendencia_id)
    p.resolvida = True
    p.resolvida_em = datetime.now(timezone.utc)
    if resolucao:
        p.resolucao = resolucao
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{pendencia_id}", response_model=Mensagem)
def remover_pendencia(pendencia_id: str, db: Session = Depends(get_db)):
    p = _get_ou_404(db, pendencia_id)
    db.delete(p)
    db.commit()
    return Mensagem(mensagem="Pendência removida")


def _get_ou_404(db: Session, pendencia_id: str) -> Pendencia:
    p = db.query(Pendencia).filter(Pendencia.id == pendencia_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pendência não encontrada")
    return p
