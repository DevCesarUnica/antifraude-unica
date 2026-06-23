"""
Router de logs de acesso — visualização dos registros de acesso ao sistema.
"""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LogAcesso, Usuario
from app.schemas import LogAcessoOut

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/acesso", response_model=list[LogAcessoOut])
def listar_logs(
    usuario_id: str | None = None,
    metodo: str | None = None,
    endpoint: str | None = None,
    status_code: int | None = None,
    data_inicio: datetime | None = None,
    data_fim: datetime | None = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = (
        db.query(LogAcesso, Usuario.nome, Usuario.perfil)
        .outerjoin(Usuario, LogAcesso.usuario_id == Usuario.id)
    )
    if usuario_id:
        q = q.filter(LogAcesso.usuario_id == usuario_id)
    if metodo:
        q = q.filter(LogAcesso.metodo == metodo.upper())
    if endpoint:
        q = q.filter(LogAcesso.endpoint.ilike(f"%{endpoint}%"))
    if status_code:
        q = q.filter(LogAcesso.status_code == status_code)
    if data_inicio:
        q = q.filter(LogAcesso.timestamp >= data_inicio)
    if data_fim:
        q = q.filter(LogAcesso.timestamp <= data_fim)

    rows = q.order_by(LogAcesso.timestamp.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": log.id,
            "usuario_id": log.usuario_id,
            "username": log.username,
            "nome": nome,
            "perfil": str(perfil) if perfil else None,
            "metodo": log.metodo,
            "endpoint": log.endpoint,
            "ip": log.ip,
            "status_code": log.status_code,
            "duracao_ms": log.duracao_ms,
            "timestamp": log.timestamp,
        }
        for log, nome, perfil in rows
    ]


@router.get("/acesso/resumo")
def resumo_logs(db: Session = Depends(get_db)):
    """Contagem de requisições por status_code nas últimas 24h."""
    from sqlalchemy import func
    from datetime import timedelta
    corte = datetime.utcnow() - timedelta(hours=24)
    resultados = (
        db.query(LogAcesso.status_code, func.count(LogAcesso.id).label("total"))
        .filter(LogAcesso.timestamp >= corte)
        .group_by(LogAcesso.status_code)
        .all()
    )
    return {"por_status": {str(r.status_code): r.total for r in resultados}}
