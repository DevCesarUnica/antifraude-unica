"""
Router de relatórios — exportação de dados em CSV/JSON com filtros avançados.
"""

import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Proposta, Corretor, AuditoriaLog, StatusProposta

router = APIRouter(prefix="/relatorios", tags=["relatorios"])


# ── Relatório de Propostas ────────────────────────────────────────────────────

@router.get("/propostas")
def relatorio_propostas(
    formato: str = Query("json", pattern="^(json|csv)$"),
    status: str | None = None,
    banco: str | None = None,
    convenio: str | None = None,
    corretor_id: str | None = None,
    data_inicio: datetime | None = None,
    data_fim: datetime | None = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    q = db.query(Proposta)
    if status:
        q = q.filter(Proposta.status == status.upper())
    if banco:
        q = q.filter(Proposta.banco.ilike(f"%{banco}%"))
    if convenio:
        q = q.filter(Proposta.convenio.ilike(f"%{convenio}%"))
    if corretor_id:
        q = q.filter(Proposta.corretor_id == corretor_id)
    if data_inicio:
        q = q.filter(Proposta.criado_em >= data_inicio)
    if data_fim:
        q = q.filter(Proposta.criado_em <= data_fim)
    propostas = q.order_by(Proposta.criado_em.desc()).offset(skip).limit(limit).all()

    campos = [
        "id", "proposta_id_externo", "cpf_cliente", "nome_cliente",
        "banco", "convenio", "produto", "valor",
        "status", "score_fraude", "resultado_motor",
        "criado_em", "atualizado_em",
    ]

    if formato == "csv":
        return _para_csv(propostas, campos, nome="propostas")

    return [_to_dict(p, campos) for p in propostas]


# ── Relatório de Antifraude ───────────────────────────────────────────────────

@router.get("/antifraude")
def relatorio_antifraude(
    formato: str = Query("json", pattern="^(json|csv)$"),
    decisao: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    data_inicio: datetime | None = None,
    data_fim: datetime | None = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    q = db.query(Proposta).filter(Proposta.score_fraude.isnot(None))
    if decisao:
        q = q.filter(Proposta.resultado_motor == decisao.upper())
    if score_min is not None:
        q = q.filter(Proposta.score_fraude >= score_min)
    if score_max is not None:
        q = q.filter(Proposta.score_fraude <= score_max)
    if data_inicio:
        q = q.filter(Proposta.criado_em >= data_inicio)
    if data_fim:
        q = q.filter(Proposta.criado_em <= data_fim)
    propostas = q.order_by(Proposta.score_fraude.desc()).limit(limit).all()

    campos = [
        "id", "proposta_id_externo", "cpf_cliente", "nome_cliente",
        "banco", "convenio", "valor",
        "score_fraude", "resultado_motor", "status",
        "criado_em",
    ]

    if formato == "csv":
        return _para_csv(propostas, campos, nome="antifraude")

    return [_to_dict(p, campos) for p in propostas]


# ── Relatório de Corretores ───────────────────────────────────────────────────

@router.get("/corretores")
def relatorio_corretores(
    formato: str = Query("json", pattern="^(json|csv)$"),
    ativo: bool | None = None,
    grupo_id: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Corretor)
    if ativo is not None:
        q = q.filter(Corretor.ativo == ativo)
    if grupo_id:
        q = q.filter(Corretor.grupo_id == grupo_id)
    corretores = q.order_by(Corretor.nome.asc()).all()

    campos = ["id", "nome", "cpf", "email", "telefone", "grupo_id", "ativo", "criado_em"]

    if formato == "csv":
        return _para_csv(corretores, campos, nome="corretores")

    return [_to_dict(c, campos) for c in corretores]


# ── Relatório de Auditoria ────────────────────────────────────────────────────

@router.get("/auditoria")
def relatorio_auditoria(
    formato: str = Query("json", pattern="^(json|csv)$"),
    proposta_id: str | None = None,
    tipo_evento: str | None = None,
    data_inicio: datetime | None = None,
    data_fim: datetime | None = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    q = db.query(AuditoriaLog)
    if proposta_id:
        q = q.filter(AuditoriaLog.proposta_id == proposta_id)
    if tipo_evento:
        q = q.filter(AuditoriaLog.evento == tipo_evento.upper())
    if data_inicio:
        q = q.filter(AuditoriaLog.criado_em >= data_inicio)
    if data_fim:
        q = q.filter(AuditoriaLog.criado_em <= data_fim)
    logs = q.order_by(AuditoriaLog.criado_em.desc()).limit(limit).all()

    campos = ["id", "proposta_id", "evento", "usuario", "dados", "timestamp"]

    if formato == "csv":
        return _para_csv(logs, campos, nome="auditoria")

    return [_to_dict(l, campos) for l in logs]


# ── KPIs resumo (usado pelo dashboard) ───────────────────────────────────────

@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    from sqlalchemy import func

    total = db.query(func.count(Proposta.id)).scalar() or 0
    aprovadas = db.query(func.count(Proposta.id)).filter(
        Proposta.status == StatusProposta.APROVADA
    ).scalar() or 0
    reprovadas = db.query(func.count(Proposta.id)).filter(
        Proposta.status == StatusProposta.REPROVADA
    ).scalar() or 0
    em_analise = db.query(func.count(Proposta.id)).filter(
        Proposta.status == StatusProposta.EM_ANALISE
    ).scalar() or 0
    volume = db.query(func.sum(Proposta.valor)).filter(
        Proposta.status == StatusProposta.APROVADA
    ).scalar() or 0.0
    score_medio = db.query(func.avg(Proposta.score_fraude)).filter(
        Proposta.score_fraude.isnot(None)
    ).scalar()

    return {
        "total_propostas": total,
        "aprovadas": aprovadas,
        "reprovadas": reprovadas,
        "em_analise": em_analise,
        "volume_aprovado": float(volume),
        "score_medio_fraude": round(float(score_medio), 1) if score_medio else None,
        "taxa_aprovacao": round(aprovadas / total * 100, 1) if total else 0,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_dict(obj, campos: list[str]) -> dict:
    result = {}
    for campo in campos:
        v = getattr(obj, campo, None)
        if isinstance(v, datetime):
            result[campo] = v.isoformat()
        elif hasattr(v, "value"):
            result[campo] = v.value
        else:
            result[campo] = v
    return result


def _para_csv(objs, campos: list[str], nome: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=campos, extrasaction="ignore")
    writer.writeheader()
    for obj in objs:
        writer.writerow(_to_dict(obj, campos))
    output.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{nome}.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)
