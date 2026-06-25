"""
Router Titan — expõe dados de referência, produtos por banco e status do serviço.

Mapeamento de erros:
  TitanAuthError  → 502 Bad Gateway   (credencial inválida — problema de config)
  TitanAPIError   → 503 Unavailable   (serviço externo indisponível)
"""

from fastapi import APIRouter, HTTPException, Query
from app.services.titan import TitanService, TitanAPIError, TitanAuthError
from app.schemas_titan import TitanCriarOperacaoRequest

router = APIRouter(prefix="/titan", tags=["titan"])


def _http_error(exc: TitanAPIError) -> HTTPException:
    if isinstance(exc, TitanAuthError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=503, detail=str(exc))


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def status_titan():
    """Conectividade, latência e estado do circuit breaker da API Titan."""
    async with TitanService() as titan:
        return await titan.status_async()


# ── Bancos ────────────────────────────────────────────────────────────────────

@router.get("/bancos")
async def listar_bancos(force_refresh: bool = False):
    """Lista todos os bancos disponíveis na Titan."""
    try:
        async with TitanService() as titan:
            return await titan.get_banks(force_refresh)
    except TitanAPIError as exc:
        raise _http_error(exc)


# ── Produtos por banco ────────────────────────────────────────────────────────

@router.get("/bancos/{banco_id}/produtos")
async def produtos_banco(banco_id: int, force_refresh: bool = False):
    """Produtos disponíveis para um banco específico."""
    try:
        async with TitanService() as titan:
            return await titan.get_produtos_banco(banco_id, force_refresh)
    except TitanAPIError as exc:
        raise _http_error(exc)


# ── Tabelas de referência por banco ──────────────────────────────────────────

@router.get("/bancos/{banco_id}/referencia")
async def referencia_banco(banco_id: int, force_refresh: bool = False):
    """
    Tabelas de referência contextualizadas para um banco específico.

    Retorna em paralelo: produtos do banco + sexos + estados civis + profissões.
    Falhas parciais retornam lista vazia para o campo afetado (degraded gracefully).
    """
    try:
        async with TitanService() as titan:
            return await titan.get_referencia_banco(banco_id, force_refresh)
    except TitanAPIError as exc:
        raise _http_error(exc)


# ── Todos os dados de referência ──────────────────────────────────────────────

@router.get("/referencia")
async def dados_referencia(force_refresh: bool = False):
    """Todos os dados de referência em paralelo (bancos, sexos, estados civis, profissões, produtos)."""
    try:
        async with TitanService() as titan:
            return await titan.get_all(force_refresh)
    except TitanAPIError as exc:
        raise _http_error(exc)


# ── Criar operação ───────────────────────────────────────────────────────────

@router.post("/operacoes", status_code=201)
async def criar_operacao(body: TitanCriarOperacaoRequest):
    """Envia uma operação ao motor de cálculo externo Titan (Hope/Ceoslab)."""
    try:
        async with TitanService() as titan:
            return await titan.create_operation(body.model_dump(exclude_none=False))
    except TitanAPIError as exc:
        raise _http_error(exc)


@router.get("/operacoes/{operation_id}")
async def consultar_operacao(operation_id: str):
    """Consulta o estado de uma operação pelo ID retornado pelo Titan."""
    try:
        async with TitanService() as titan:
            return await titan.get_operation(operation_id)
    except TitanAPIError as exc:
        raise _http_error(exc)


# ── Sincronização de propostas ────────────────────────────────────────────────

@router.post("/sync")
async def sincronizar_propostas(
    page_size: int = Query(default=50, ge=1, le=200),
    max_pages: int = Query(default=20, ge=1, le=100),
    data_inicio: str | None = Query(default=None, description="ISO 8601, ex: 2026-06-01T00:00:00-03:00"),
    data_fim: str | None = Query(default=None, description="ISO 8601, ex: 2026-06-30T23:59:59-03:00"),
    status_id: int | None = Query(default=None, description="ID do status Titan (ex: 23=Pago)"),
):
    """
    Importa operações do Titan como propostas e as processa pelo motor antifraude.
    Operações já importadas são ignoradas (idempotente).
    Filtra por data e/ou status do Titan quando informados.
    """
    from app.services.titan_sync import sincronizar
    resultado = await sincronizar(
        page_size=page_size,
        max_pages=max_pages,
        data_inicio=data_inicio,
        data_fim=data_fim,
        status_id=status_id,
    )
    return resultado


# ── Cache ─────────────────────────────────────────────────────────────────────

@router.delete("/cache")
async def invalidar_cache(endpoint: str | None = None):
    """Invalida cache Redis/SQLite. Sem parâmetros invalida tudo."""
    async with TitanService() as titan:
        await titan.invalidar_cache(endpoint)
    return {"mensagem": f"Cache invalidado: {endpoint or 'todos'}"}
