"""
Router de propostas — CRUD + enfileiramento assíncrono.

Idempotência via proposta_id_externo:
  POST com mesmo proposta_id_externo retorna a proposta existente (HTTP 200)
  em vez de criar duplicata.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Proposta, StatusProposta, TipoEvento
from app.schemas import (
    PropostaCreate, PropostaOut, PropostaSummary, AuditoriaOut, Mensagem
)
from app.services.auditoria import AuditoriaService

# Modo dev: processa de forma síncrona (sem Celery/Redis).
# Em produção com Docker, substitui por: from app.workers.tasks import processar_proposta
def _processar_sync(proposta_id: str):
    """Processa a proposta de forma síncrona (dev sem Celery)."""
    from app.database import SessionLocal
    from app.services.antifraude import MotorAntifraude, ResultadoMotor
    from app.models import StatusProposta, TipoEvento
    db2 = SessionLocal()
    try:
        p = db2.query(Proposta).filter(Proposta.id == proposta_id).first()
        if not p:
            return
        audit = AuditoriaService(db2)
        p.status = StatusProposta.EM_ANALISE
        audit.registrar(proposta_id, TipoEvento.INICIO_ANALISE)

        decisao = MotorAntifraude(db2).avaliar(p)
        p.score_fraude = decisao.score
        p.resultado_motor = decisao.resultado
        p.decisao_detalhes = {
            "resultado": decisao.resultado,
            "score": decisao.score,
            "motivo_principal": decisao.motivo_principal,
            "flags": decisao.flags,
        }
        audit.registrar(proposta_id, TipoEvento.DECISAO_MOTOR, dados=p.decisao_detalhes)

        if decisao.resultado == ResultadoMotor.BLOQUEADO:
            p.status = StatusProposta.BLOQUEADA
        elif decisao.resultado == ResultadoMotor.MANUAL:
            p.status = StatusProposta.ANALISE_MANUAL
        else:
            p.status = StatusProposta.APROVADA

        db2.commit()
    finally:
        db2.close()

processar_proposta = type("Task", (), {"apply_async": staticmethod(lambda args, **kw: _processar_sync(args[0]))})()

router = APIRouter(prefix="/propostas", tags=["propostas"])


# ── Criar / enfileirar ────────────────────────────────────────────────────────

@router.post("/", response_model=PropostaOut, status_code=status.HTTP_201_CREATED)
def criar_proposta(body: PropostaCreate, request: Request, db: Session = Depends(get_db)):
    """
    Recebe uma proposta e a enfileira para processamento assíncrono.

    Idempotente: se proposta_id_externo já existe, retorna a existente sem duplicar.
    """
    # Idempotência
    existente = db.query(Proposta).filter(
        Proposta.proposta_id_externo == body.proposta_id_externo
    ).first()
    if existente:
        return existente

    proposta = Proposta(**body.model_dump())
    proposta.status = StatusProposta.ENFILEIRADA
    db.add(proposta)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        # Race condition — outro request criou antes
        return db.query(Proposta).filter(
            Proposta.proposta_id_externo == body.proposta_id_externo
        ).first()

    auditoria = AuditoriaService(db)
    auditoria.registrar(
        proposta.id,
        TipoEvento.CRIACAO,
        dados={"ip": request.client.host if request.client else None},
    )
    auditoria.registrar(proposta.id, TipoEvento.ENFILEIRAMENTO)
    db.commit()

    # Dispara processamento assíncrono
    processar_proposta.apply_async(args=[proposta.id], queue="propostas")

    return proposta


# ── Listagem e filtros ────────────────────────────────────────────────────────

@router.get("/", response_model=list[PropostaOut])
def listar_propostas(
    status: str | None = None,
    banco: str | None = None,
    cpf: str | None = None,
    nome: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(Proposta)
    if status:
        q = q.filter(Proposta.status == status)
    if banco:
        q = q.filter(Proposta.banco == banco)
    if cpf:
        digits = cpf.replace(".", "").replace("-", "")
        q = q.filter(Proposta.cpf_cliente.ilike(f"%{digits}%"))
    if nome:
        q = q.filter(Proposta.nome_cliente.ilike(f"%{nome}%"))
    return q.order_by(Proposta.criado_em.desc()).offset(skip).limit(limit).all()


@router.get("/summary", response_model=PropostaSummary)
def resumo_propostas(db: Session = Depends(get_db)):
    """Contadores por status para o dashboard."""
    from sqlalchemy import func

    rows = db.query(Proposta.status, func.count(Proposta.id)).group_by(Proposta.status).all()
    counts = {r.status: r[1] for r in rows}
    total = sum(counts.values())

    return PropostaSummary(
        total=total,
        enfileiradas=counts.get(StatusProposta.ENFILEIRADA, 0),
        em_analise=counts.get(StatusProposta.EM_ANALISE, 0),
        aprovadas=counts.get(StatusProposta.APROVADA, 0),
        reprovadas=counts.get(StatusProposta.REPROVADA, 0),
        bloqueadas=counts.get(StatusProposta.BLOQUEADA, 0),
        analise_manual=counts.get(StatusProposta.ANALISE_MANUAL, 0),
        enviadas_banco=counts.get(StatusProposta.ENVIADA_BANCO, 0),
        confirmadas_banco=counts.get(StatusProposta.CONFIRMADA_BANCO, 0),
        erro=counts.get(StatusProposta.ERRO, 0),
    )


# ── Individual ────────────────────────────────────────────────────────────────

@router.get("/{proposta_id}", response_model=PropostaOut)
def obter_proposta(proposta_id: str, db: Session = Depends(get_db)):
    proposta = db.query(Proposta).filter(Proposta.id == proposta_id).first()
    if not proposta:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    return proposta


@router.get("/{proposta_id}/debug")
def debug_proposta(proposta_id: str, db: Session = Depends(get_db)):
    """
    Retorna o raio-x completo da decisão antifraude:
    regras que dispararam, score, motivo e trilha de auditoria.
    """
    proposta = _get_ou_404(db, proposta_id)
    historico = AuditoriaService(db).historico(proposta_id)
    return {
        "id": proposta.id,
        "proposta_id_externo": proposta.proposta_id_externo,
        "status": proposta.status,
        "score_fraude": proposta.score_fraude,
        "resultado_motor": proposta.resultado_motor,
        "tentativas": proposta.tentativas,
        "ultimo_erro": proposta.ultimo_erro,
        "decisao": proposta.decisao_detalhes,
        "auditoria": [
            {
                "evento": e.evento,
                "dados": e.dados,
                "usuario": e.usuario,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in historico
        ],
    }


@router.get("/{proposta_id}/auditoria", response_model=list[AuditoriaOut])
def auditoria_proposta(proposta_id: str, db: Session = Depends(get_db)):
    proposta = db.query(Proposta).filter(Proposta.id == proposta_id).first()
    if not proposta:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    return AuditoriaService(db).historico(proposta_id)


# ── Ações manuais (analistas) ─────────────────────────────────────────────────

@router.post("/{proposta_id}/aprovar", response_model=PropostaOut)
def aprovar_manual(proposta_id: str, request: Request, db: Session = Depends(get_db)):
    proposta = _get_ou_404(db, proposta_id)
    _exige_status(proposta, StatusProposta.ANALISE_MANUAL)

    proposta.status = StatusProposta.APROVADA
    AuditoriaService(db).registrar(
        proposta_id,
        TipoEvento.ALTERACAO_MANUAL,
        dados={"acao": "aprovacao_manual"},
        usuario=request.headers.get("x-usuario"),
        ip_origem=request.client.host if request.client else None,
    )
    db.commit()

    processar_proposta.apply_async(args=[proposta_id], queue="propostas")
    return proposta


@router.post("/{proposta_id}/bloquear", response_model=PropostaOut)
def bloquear_manual(proposta_id: str, request: Request, db: Session = Depends(get_db)):
    proposta = _get_ou_404(db, proposta_id)
    proposta.status = StatusProposta.BLOQUEADA
    AuditoriaService(db).registrar(
        proposta_id,
        TipoEvento.ALTERACAO_MANUAL,
        dados={"acao": "bloqueio_manual"},
        usuario=request.headers.get("x-usuario"),
        ip_origem=request.client.host if request.client else None,
    )
    db.commit()
    return proposta


@router.post("/{proposta_id}/reprocessar", response_model=Mensagem)
def reprocessar(proposta_id: str, db: Session = Depends(get_db)):
    proposta = _get_ou_404(db, proposta_id)
    if proposta.status not in (StatusProposta.ERRO, StatusProposta.BLOQUEADA):
        raise HTTPException(status_code=400, detail="Apenas propostas ERRO ou BLOQUEADA podem ser reprocessadas")

    proposta.status = StatusProposta.ENFILEIRADA
    proposta.ultimo_erro = None
    AuditoriaService(db).registrar(proposta_id, TipoEvento.REPROCESSAMENTO)
    db.commit()

    processar_proposta.apply_async(args=[proposta_id], queue="propostas")
    return Mensagem(mensagem="Proposta reenfileirada para reprocessamento")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_ou_404(db: Session, proposta_id: str) -> Proposta:
    p = db.query(Proposta).filter(Proposta.id == proposta_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    return p


def _exige_status(proposta: Proposta, *status_validos: StatusProposta):
    if proposta.status not in status_validos:
        validos = ", ".join(s.value for s in status_validos)
        raise HTTPException(
            status_code=400,
            detail=f"Ação inválida para status '{proposta.status}'. Esperado: {validos}",
        )
