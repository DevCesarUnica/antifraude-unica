"""
Serviço de dashboard operacional da Mesa de Crédito.

Centraliza lógica de query/normalização extraída de routers/propostas.py,
tornando-a testável e reutilizável por qualquer router ou tarefa Celery.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models import Proposta


# ── Detecção de origem ────────────────────────────────────────────────────────

def determinar_origem(proposta_id_externo: str) -> str:
    """
    Detecta a origem de uma proposta pelo prefixo do ID externo.
      titan-*  → "hope"   (banco Hope via API Titan/Ceoslab)
      storm-*  → "storm"  (hub Storm Tecnologia)
      outros   → "manual" (entrada manual ou importação CSV)
    """
    if proposta_id_externo.startswith("titan-"):
        return "hope"
    if proposta_id_externo.startswith("storm-"):
        return "storm"
    return "manual"


# ── Normalização ──────────────────────────────────────────────────────────────

def normalizar_proposta(p: Proposta) -> dict:
    """
    Transforma uma Proposta ORM em dict padronizado para o dashboard.

    Campos gerados:
      ade              — proposta_id_externo (código externo / "ADE")
      banco            — nome do banco sem hardcode (extraído do campo .banco)
      origem           — detectado pelo prefixo do ade
      observacoes      — último_erro OU motivo_principal OU payload.observacoes
      data_agendamento — lido do payload_original
      possui_arquivos  — True se payload tiver chave arquivos/documentos/files/anexos
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

    status_val = p.status
    status_str = str(status_val.value if hasattr(status_val, "value") else status_val)

    shadow = p.limite_corretor_shadow or {}

    return {
        "id":               p.id,
        "ade":              p.proposta_id_externo,
        "banco":            p.banco,
        "convenio":         p.convenio,
        "produto":          p.produto,
        "corretor":         p.corretor.nome if p.corretor else None,
        "corretor_id":      p.corretor_id,
        "valor":            p.valor,
        "status":           status_str,
        "cpf":              p.cpf_cliente,
        "nome_cliente":     p.nome_cliente,
        "uf_cliente":       p.uf_cliente,
        "observacoes":      observacoes,
        "data_importacao":  p.criado_em,
        "data_atualizacao": p.atualizado_em,
        "data_agendamento": str(data_agendamento) if data_agendamento else None,
        "possui_arquivos":  possui_arquivos,
        "score_fraude":     p.score_fraude,
        "resultado_motor":  p.resultado_motor,
        "origem":           determinar_origem(p.proposta_id_externo),
        "tentativas":       p.tentativas,
        "corretor_esteira":        shadow.get("esteira"),
        "corretor_limite":         shadow.get("limite"),
        "limite_corretor_status":  shadow.get("status"),
    }


# ── Colunas ordenáveis ────────────────────────────────────────────────────────

_SORT_COLS: dict[str, object] = {
    "criado_em":     lambda: Proposta.criado_em,
    "atualizado_em": lambda: Proposta.atualizado_em,
    "valor":         lambda: Proposta.valor,
    "status":        lambda: Proposta.status,
    "banco":         lambda: Proposta.banco,
    "nome_cliente":  lambda: Proposta.nome_cliente,
}


# ── Query principal ───────────────────────────────────────────────────────────

def query_dashboard(
    db: Session,
    *,
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
) -> tuple[list[dict], int]:
    """
    Executa a query do dashboard com filtros, ordenação e paginação.
    Retorna (items_normalizados, total_sem_paginacao).
    """
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

    limit_safe = min(limit, 200)
    items = q.order_by(ordenado).offset(skip).limit(limit_safe).all()

    return [normalizar_proposta(p) for p in items], total
