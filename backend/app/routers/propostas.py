"""
Router de propostas — CRUD + enfileiramento assíncrono.

Idempotência via proposta_id_externo:
  POST com mesmo proposta_id_externo retorna a proposta existente (HTTP 200)
  em vez de criar duplicata.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Proposta, StatusProposta, TipoEvento, Usuario
from app.schemas import (
    PropostaCreate, PropostaOut, PropostaSummary, PropostasDashboardResponse,
    AuditoriaOut, Mensagem,
)
from app.services.auditoria import AuditoriaService, log_auditoria
from app.services.propostas_dashboard import query_dashboard

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
    items, total = query_dashboard(
        db,
        banco=banco, status=status, cpf=cpf, nome=nome, corretor=corretor,
        valor_min=valor_min, valor_max=valor_max,
        data_inicio=data_inicio, data_fim=data_fim,
        order_by=order_by, order_dir=order_dir,
        skip=skip, limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ── Busca textual rápida (ADE, CPF, nome) ────────────────────────────────────

@router.get("/search")
def search_propostas(
    q: str = Query(..., min_length=2, description="ADE, CPF ou nome do cliente"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Busca rápida por ADE, CPF ou nome. Retorna no formato PropostaDashboardItem
    para uso em autocomplete e consultas da mesa de crédito.
    Resultados ordenados por data de importação decrescente, sem duplicatas.
    """
    import re
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload
    from app.services.propostas_dashboard import normalizar_proposta

    q_clean = q.strip()
    digits  = re.sub(r"\D", "", q_clean)

    conditions: list = [
        Proposta.proposta_id_externo.ilike(f"%{q_clean}%"),
        Proposta.nome_cliente.ilike(f"%{q_clean}%"),
    ]
    if len(digits) >= 3:
        conditions.append(Proposta.cpf_cliente.like(f"%{digits}%"))

    rows = (
        db.query(Proposta)
        .options(joinedload(Proposta.corretor))
        .filter(or_(*conditions))
        .order_by(Proposta.criado_em.desc())
        .limit(min(limit, 100))
        .all()
    )

    seen: set[str] = set()
    items: list[dict] = []
    for p in rows:
        if p.proposta_id_externo not in seen:
            seen.add(p.proposta_id_externo)
            items.append(normalizar_proposta(p))

    return {"query": q_clean, "total": len(items), "items": items}


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


@router.post("/{proposta_id}/enviar-banco", response_model=PropostaOut)
async def enviar_banco(
    proposta_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    """
    Envia proposta APROVADA para criação na API Titan (Hope / banco parceiro).
    Extrai automaticamente os dados financeiros do payload_original.
    Status: APROVADA → ENVIADA_BANCO.
    Armazena id_operacao_banco e resposta_banco no registro.
    """
    from app.services.titan_envio import extrair_calculo_de_payload, enviar_para_titan
    from app.core.config import settings

    proposta = _get_ou_404(db, proposta_id)
    _exige_status(proposta, StatusProposta.APROVADA)

    calculo = extrair_calculo_de_payload(proposta.payload_original)
    if not calculo:
        raise HTTPException(
            status_code=422,
            detail=(
                "Não foi possível extrair dados financeiros (firstDueDate, installmentQuantity, "
                "totalValue, financedValue, installments) do payload desta proposta. "
                "Propostas Hope importadas via /titan/sync têm esses dados automaticamente. "
                "Propostas Storm ou manuais ainda não suportam envio automático ao banco."
            ),
        )

    resultado = await enviar_para_titan(
        proposta=proposta,
        calculo=calculo,
        base_url=settings.titan_base_url,
        api_key=settings.titan_api_key,
    )

    proposta.resposta_banco = resultado.get("raw_response")

    if resultado["status"] in ("APROVADA", "DUPLICADA"):
        if resultado.get("operation_id"):
            proposta.id_operacao_banco = str(resultado["operation_id"])
        proposta.status = StatusProposta.ENVIADA_BANCO
        proposta.ultimo_erro = None

        AuditoriaService(db).registrar(
            proposta_id,
            TipoEvento.ENVIO_BANCO,
            dados={
                "acao":         "envio_banco_titan",
                "resultado":    resultado["status"],
                "operation_id": resultado.get("operation_id"),
                "mensagem":     resultado["mensagem"],
            },
            usuario=usuario.username,
            ip_origem=request.client.host if request.client else None,
        )
        log_auditoria(
            db,
            acao=f"Enviou proposta {proposta.proposta_id_externo} ao banco Titan",
            usuario=usuario,
            request=request,
            tipo_entidade="proposta",
            entidade_id=proposta_id,
            antes={"status": "APROVADA"},
            depois={"status": "ENVIADA_BANCO", "operation_id": resultado.get("operation_id")},
            risco="ALTO",
        )
        db.commit()
        return proposta

    if resultado["status"] == "RECUSADA":
        proposta.ultimo_erro = resultado["mensagem"]
        db.commit()
        raise HTTPException(
            status_code=422,
            detail=f"Titan recusou a proposta: {resultado['mensagem']}",
        )

    # ERRO_API
    proposta.ultimo_erro = resultado["mensagem"]
    db.commit()
    raise HTTPException(
        status_code=503,
        detail=f"Titan temporariamente indisponível: {resultado['mensagem']}",
    )


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


# ── Migração / reprocessamento em lote ───────────────────────────────────────

@router.post("/reprocessar-aprovadas", response_model=Mensagem)
def reprocessar_aprovadas(
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(verificar_token),
):
    """
    Reenfileira todas as propostas APROVADA para reavaliação pelo motor.
    Útil após mudança de regras ou comportamento do motor.
    Requer perfil ADMIN ou GESTOR.
    """
    if usuario.perfil not in ("admin", "gestor"):
        raise HTTPException(status_code=403, detail="Requer perfil admin ou gestor")

    propostas = db.query(Proposta).filter(
        Proposta.status == StatusProposta.APROVADA
    ).all()

    total = len(propostas)
    for p in propostas:
        p.status = StatusProposta.ENFILEIRADA
        p.ultimo_erro = None
        AuditoriaService(db).registrar(
            p.id, TipoEvento.REPROCESSAMENTO,
            dados={"motivo": "reprocessamento_em_lote", "usuario": usuario.username},
        )

    db.commit()

    for p in propostas:
        processar_proposta.apply_async(args=[p.id], queue="propostas")

    return Mensagem(mensagem=f"{total} proposta(s) reenfileiradas para reavaliação")


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
