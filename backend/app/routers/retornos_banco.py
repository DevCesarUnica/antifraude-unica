"""
Router de retornos de banco — registros de resposta dos bancos sobre propostas.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RetornoBanco, Proposta, StatusProposta, TipoEvento
from app.schemas import RetornoCreate, RetornoOut, Mensagem
from app.services.auditoria import AuditoriaService

router = APIRouter(prefix="/retornos-banco", tags=["retornos-banco"])


@router.get("/", response_model=list[RetornoOut])
def listar_retornos(
    banco: str | None = None,
    tipo_retorno: str | None = None,
    processado: bool | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(RetornoBanco)
    if banco:
        q = q.filter(RetornoBanco.banco.ilike(f"%{banco}%"))
    if tipo_retorno:
        q = q.filter(RetornoBanco.tipo_retorno == tipo_retorno.upper())
    if processado is not None:
        q = q.filter(RetornoBanco.processado == processado)
    return q.order_by(RetornoBanco.criado_em.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=RetornoOut, status_code=status.HTTP_201_CREATED)
def registrar_retorno(body: RetornoCreate, db: Session = Depends(get_db)):
    retorno = RetornoBanco(**body.model_dump())
    db.add(retorno)
    db.commit()
    db.refresh(retorno)
    return retorno


@router.post("/{retorno_id}/processar", response_model=RetornoOut)
def processar_retorno(retorno_id: str, db: Session = Depends(get_db)):
    """
    Processa o retorno: atualiza o status da proposta vinculada conforme o tipo de retorno.
    """
    retorno = _get_ou_404(db, retorno_id)
    if retorno.processado:
        raise HTTPException(status_code=400, detail="Retorno já processado")

    if retorno.proposta_id:
        proposta = db.query(Proposta).filter(Proposta.id == retorno.proposta_id).first()
        if proposta:
            _mapear_status(proposta, retorno.tipo_retorno, db)
            AuditoriaService(db).registrar(
                proposta.id,
                TipoEvento.RETORNO_BANCO,
                dados={"tipo_retorno": retorno.tipo_retorno, "retorno_id": retorno.id},
            )

    retorno.processado = True
    retorno.processado_em = datetime.utcnow()
    db.commit()
    db.refresh(retorno)
    return retorno


def _mapear_status(proposta: Proposta, tipo_retorno: str, db: Session):
    mapa = {
        "APROVACAO":    StatusProposta.CONFIRMADA_BANCO,
        "REPROVACAO":   StatusProposta.REPROVADA,
        "CANCELAMENTO": StatusProposta.REPROVADA,
    }
    novo_status = mapa.get(tipo_retorno)
    if novo_status:
        proposta.status = novo_status


def _get_ou_404(db: Session, retorno_id: str) -> RetornoBanco:
    r = db.query(RetornoBanco).filter(RetornoBanco.id == retorno_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Retorno não encontrado")
    return r
