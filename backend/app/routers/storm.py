"""
Router Storm — proxy para a API Storm Tecnologia.

Storm atua como colaborador do sistema Unica Promotora.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.storm import StormService, StormAPIError, StormAuthError, StormPermissionError

router = APIRouter(prefix="/storm", tags=["storm"])


def _handle_error(exc: Exception):
    if isinstance(exc, StormPermissionError):
        # 403 da Storm — problema de permissão de conta, não de sessão
        raise HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, StormAuthError):
        # 502 em vez de 401 — evita que o frontend interprete como sessão expirada
        raise HTTPException(status_code=502, detail=str(exc))
    raise HTTPException(status_code=503, detail=str(exc))


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def status_storm():
    async with StormService() as storm:
        return storm.status()


@router.post("/status/reset")
async def resetar_circuit_breaker():
    from app.core.circuit_breaker import get_breaker
    get_breaker("storm_api").resetar()
    return {"mensagem": "Circuit breaker resetado com sucesso."}


# ── Antifraude ────────────────────────────────────────────────────────────────

@router.get("/antifraude/contratos")
async def listar_antifraude(
    esteira: str = Query(..., description="Fila de antifraude (ex: antifraude)"),
    pagina: int = Query(1, ge=1),
):
    try:
        async with StormService() as storm:
            return await storm.get_antifraude_contratos(esteira, pagina)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/antifraude/tipos-recusas")
async def tipos_recusas():
    try:
        async with StormService() as storm:
            return await storm.get_tipos_recusas()
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/antifraude/tipos-pendencias")
async def tipos_pendencias():
    try:
        async with StormService() as storm:
            return await storm.get_tipos_pendencias()
    except StormAPIError as exc:
        _handle_error(exc)


@router.post("/antifraude/{contrato_id}/aprovar")
async def aprovar(contrato_id: int):
    try:
        async with StormService() as storm:
            return await storm.aprovar_contrato(contrato_id)
    except StormAPIError as exc:
        _handle_error(exc)


class RecusaBody(BaseModel):
    tipo_recusa_id: int
    observacao: str | None = None


@router.post("/antifraude/{contrato_id}/recusar")
async def recusar(contrato_id: int, body: RecusaBody):
    try:
        async with StormService() as storm:
            return await storm.recusar_contrato(contrato_id, body.model_dump(exclude_none=True))
    except StormAPIError as exc:
        _handle_error(exc)


class PendenciaBody(BaseModel):
    tipo_pendencia_id: int
    observacao: str | None = None


@router.post("/antifraude/{contrato_id}/pendenciar")
async def pendenciar(contrato_id: int, body: PendenciaBody):
    try:
        async with StormService() as storm:
            return await storm.pendenciar_contrato(contrato_id, body.model_dump(exclude_none=True))
    except StormAPIError as exc:
        _handle_error(exc)


class ReanalisaBody(BaseModel):
    observacao: str


@router.post("/antifraude/{contrato_id}/reanalisar")
async def reanalisar(contrato_id: int, body: ReanalisaBody):
    try:
        async with StormService() as storm:
            return await storm.reanalisar_contrato(contrato_id, body.model_dump())
    except StormAPIError as exc:
        _handle_error(exc)


# ── Contratos ─────────────────────────────────────────────────────────────────

@router.get("/contratos")
async def listar_contratos(
    pagina: int = Query(1, ge=1),
    cpf: str | None = None,
    ff: str | None = None,
    id_banco: int | None = None,
    id_status: int | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
):
    try:
        async with StormService() as storm:
            return await storm.get_contratos(pagina, cpf, ff, id_banco, id_status, data_inicio, data_fim)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/contratos/{ff}/acompanhamento")
async def acompanhamento_contrato(ff: str):
    try:
        async with StormService() as storm:
            return await storm.get_acompanhamento_contrato(ff)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/contratos/historico")
async def historico_contrato(ff: str = Query(..., description="Código FF do contrato")):
    try:
        async with StormService() as storm:
            return await storm.get_historico_contrato(ff)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/contratos/status")
async def status_contratos():
    try:
        async with StormService() as storm:
            return await storm.get_status_contrato()
    except StormAPIError as exc:
        _handle_error(exc)


# ── Clientes ──────────────────────────────────────────────────────────────────

@router.get("/clientes/cpf/{cpf}")
async def cliente_por_cpf(cpf: str):
    try:
        async with StormService() as storm:
            return await storm.get_cliente_por_cpf(cpf)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/clientes/telefone/{telefone}")
async def cliente_por_telefone(telefone: str):
    try:
        async with StormService() as storm:
            return await storm.get_cliente_por_telefone(telefone)
    except StormAPIError as exc:
        _handle_error(exc)


# ── Colaboradores ─────────────────────────────────────────────────────────────

@router.get("/colaboradores")
async def listar_colaboradores(
    pagina: int = Query(1, ge=1),
    usuario: str | None = None,
    status_usuario: str | None = None,
):
    try:
        async with StormService() as storm:
            return await storm.get_colaboradores(pagina, usuario, status_usuario)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/colaboradores/{colaborador_id}")
async def obter_colaborador(colaborador_id: int):
    try:
        async with StormService() as storm:
            return await storm.get_colaborador(colaborador_id)
    except StormAPIError as exc:
        _handle_error(exc)


# ── Simulações ────────────────────────────────────────────────────────────────

@router.get("/simulacoes/clt")
async def simular_clt(
    cpf: str = Query(...),
    banco_id: int = Query(...),
    valor_solicitado: float | None = None,
    matricula: str | None = None,
):
    try:
        async with StormService() as storm:
            return await storm.simular_clt(cpf, banco_id, valor_solicitado=valor_solicitado, matricula=matricula)
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/simulacoes/fgts")
async def simular_fgts(
    cpf: str = Query(...),
    banco_id: int = Query(...),
):
    try:
        async with StormService() as storm:
            return await storm.simular_fgts(cpf, banco_id)
    except StormAPIError as exc:
        _handle_error(exc)


# ── Referência ────────────────────────────────────────────────────────────────

@router.get("/bancos")
async def bancos_storm():
    try:
        async with StormService() as storm:
            return await storm.get_bancos()
    except StormAPIError as exc:
        _handle_error(exc)


@router.get("/orgaos")
async def orgaos_storm():
    try:
        async with StormService() as storm:
            return await storm.get_orgaos()
    except StormAPIError as exc:
        _handle_error(exc)
