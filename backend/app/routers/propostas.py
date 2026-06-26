"""
Router de propostas — CRUD + enfileiramento assíncrono.

Idempotência via proposta_id_externo:
  POST com mesmo proposta_id_externo retorna a proposta existente (HTTP 200)
  em vez de criar duplicata.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Proposta, StatusProposta, TipoEvento, Usuario
from app.schemas import (
    PropostaCreate, PropostaOut, PropostaSummary, PropostasDashboardResponse,
    AuditoriaOut, Mensagem,
)
from app.services.auditoria import AuditoriaService, log_auditoria

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

from app.routers.auth import verificar_token

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


# ── Dashboard operacional ─────────────────────────────────────────────────────

def _determinar_origem(proposta_id_externo: str) -> str:
    if proposta_id_externo.startswith("titan-"):
        return "hope"
    if proposta_id_externo.startswith("storm-"):
        return "storm"
    return "manual"


def _normalizar_proposta(p: Proposta) -> dict:
    """
    Normaliza uma proposta para o dashboard operacional.
    Detecta a origem pelo prefixo do ID externo — nunca assume banco fixo.
    """
    payload = p.payload_original or {}
    decisao = p.decisao_detalhes or {}

    observacoes = (
        p.ultimo_erro
        or decisao.get("motivo_principal")
        or payload.get("observacoes")
        or payload.get("obs")
        or None
    )

    data_agendamento = payload.get("data_agendamento") or payload.get("agendamento") or None
    if isinstance(data_agendamento, str) and not data_agendamento.strip():
        data_agendamento = None

    possui_arquivos = bool(
        payload.get("arquivos")
        or payload.get("documentos")
        or payload.get("files")
        or payload.get("anexos")
    )

    return {
        "id": p.id,
        "ade": p.proposta_id_externo,
        "banco": p.banco,
        "convenio": p.convenio,
        "produto": p.produto,
        "corretor": p.corretor.nome if p.corretor else None,
        "corretor_id": p.corretor_id,
        "valor": p.valor,
        "status": str(p.status.value if hasattr(p.status, "value") else p.status),
        "cpf": p.cpf_cliente,
        "nome_cliente": p.nome_cliente,
        "uf_cliente": p.uf_cliente,
        "observacoes": observacoes,
        "data_importacao": p.criado_em,
        "data_atualizacao": p.atualizado_em,
        "data_agendamento": str(data_agendamento) if data_agendamento else None,
        "possui_arquivos": possui_arquivos,
        "score_fraude": p.score_fraude,
        "resultado_motor": p.resultado_motor,
        "origem": _determinar_origem(p.proposta_id_externo),
        "tentativas": p.tentativas,
    }


_SORT_COLS = {
    "criado_em":    lambda: Proposta.criado_em,
    "atualizado_em":lambda: Proposta.atualizado_em,
    "valor":        lambda: Proposta.valor,
    "status":       lambda: Proposta.status,
    "banco":        lambda: Proposta.banco,
    "nome_cliente": lambda: Proposta.nome_cliente,
}


@router.get("/dashboard", response_model=PropostasDashboardResponse)
def dashboard_propostas(
    banco: str | None = None,
    status: str | None = None,
    cpf: str | None = None,
    nome: str | None = None,
    corretor: str | None = None,
    valor_min: float | None = None,
    valor_max: float | None = None,
    data_inicio: datetime | None = None,
    data_fim: datetime | None = None,
    order_by: str = "criado_em",
    order_dir: str = "desc",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: Usuario = Depends(verificar_token),
):
    """Painel operacional da mesa de crédito — propostas normalizadas com filtros e ordenação."""
    from datetime import datetime as _dt
    from sqlalchemy.orm import joinedload
    from app.models import Corretor

    q = db.query(Proposta).options(joinedload(Proposta.corretor))

    if banco:
        q = q.filter(Proposta.banco.ilike(f"%{banco}%"))
    if status:
        q = q.filter(Proposta.status == status.upper())
    if cpf:
        digits = cpf.replace(".", "").replace("-", "").replace("/", "")
        q = q.filter(Proposta.cpf_cliente.ilike(f"%{digits}%"))
    if nome:
        q = q.filter(Proposta.nome_cliente.ilike(f"%{nome}%"))
    if corretor:
        q = q.join(Corretor, Proposta.corretor_id == Corretor.id, isouter=True)
        q = q.filter(Corretor.nome.ilike(f"%{corretor}%"))
    if valor_min is not None:
        q = q.filter(Proposta.valor >= valor_min)
    if valor_max is not None:
        q = q.filter(Proposta.valor <= valor_max)
    if data_inicio:
        q = q.filter(Proposta.criado_em >= data_inicio)
    if data_fim:
        q = q.filter(Proposta.criado_em <= data_fim)

    total = q.count()

    col_fn = _SORT_COLS.get(order_by, _SORT_COLS["criado_em"])
    col = col_fn()
    ordenado = col.desc() if order_dir.lower() != "asc" else col.asc()

    items = q.order_by(ordenado).offset(skip).limit(min(limit, 200)).all()

    return {
        "items": [_normalizar_proposta(p) for p in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


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
def aprovar_manual(
    proposta_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    proposta = _get_ou_404(db, proposta_id)
    _exige_status(proposta, StatusProposta.ANALISE_MANUAL)

    status_anterior = str(proposta.status)
    proposta.status = StatusProposta.APROVADA
    AuditoriaService(db).registrar(
        proposta_id,
        TipoEvento.ALTERACAO_MANUAL,
        dados={"acao": "aprovacao_manual"},
        usuario=usuario.username,
        ip_origem=request.client.host if request.client else None,
    )
    log_auditoria(
        db,
        acao=f"Aprovou proposta {proposta.proposta_id_externo}",
        usuario=usuario,
        request=request,
        tipo_entidade="proposta",
        entidade_id=proposta_id,
        antes={"status": status_anterior},
        depois={"status": "APROVADA"},
        risco="ALTO",
    )
    db.commit()

    processar_proposta.apply_async(args=[proposta_id], queue="propostas")
    return proposta


@router.post("/{proposta_id}/bloquear", response_model=PropostaOut)
def bloquear_manual(
    proposta_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    proposta = _get_ou_404(db, proposta_id)
    status_anterior = str(proposta.status)
    proposta.status = StatusProposta.BLOQUEADA
    AuditoriaService(db).registrar(
        proposta_id,
        TipoEvento.ALTERACAO_MANUAL,
        dados={"acao": "bloqueio_manual"},
        usuario=usuario.username,
        ip_origem=request.client.host if request.client else None,
    )
    log_auditoria(
        db,
        acao=f"Bloqueou proposta {proposta.proposta_id_externo}",
        usuario=usuario,
        request=request,
        tipo_entidade="proposta",
        entidade_id=proposta_id,
        antes={"status": status_anterior},
        depois={"status": "BLOQUEADA"},
        risco="ALTO",
    )
    db.commit()
    return proposta


@router.post("/{proposta_id}/reprocessar", response_model=Mensagem)
def reprocessar(
    proposta_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    proposta = _get_ou_404(db, proposta_id)
    if proposta.status not in (StatusProposta.ERRO, StatusProposta.BLOQUEADA):
        raise HTTPException(status_code=400, detail="Apenas propostas ERRO ou BLOQUEADA podem ser reprocessadas")

    status_anterior = str(proposta.status)
    proposta.status = StatusProposta.ENFILEIRADA
    proposta.ultimo_erro = None
    AuditoriaService(db).registrar(proposta_id, TipoEvento.REPROCESSAMENTO)
    log_auditoria(
        db,
        acao=f"Reprocessou proposta {proposta.proposta_id_externo}",
        usuario=usuario,
        request=request,
        tipo_entidade="proposta",
        entidade_id=proposta_id,
        antes={"status": status_anterior},
        depois={"status": "ENFILEIRADA"},
        risco="MEDIO",
    )
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
