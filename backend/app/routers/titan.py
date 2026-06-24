"""
Router Titan — expõe dados de referência, produtos por banco e status do serviço.

Mapeamento de erros:
  TitanAuthError  → 502 Bad Gateway   (credencial inválida — problema de config)
  TitanAPIError   → 503 Unavailable   (serviço externo indisponível)
"""

from fastapi import APIRouter, HTTPException
from app.services.titan import TitanService, TitanAPIError, TitanAuthError

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


# ── Cache ─────────────────────────────────────────────────────────────────────

@router.delete("/cache")
async def invalidar_cache(endpoint: str | None = None):
    """Invalida cache Redis/SQLite. Sem parâmetros invalida tudo."""
    async with TitanService() as titan:
        await titan.invalidar_cache(endpoint)
    return {"mensagem": f"Cache invalidado: {endpoint or 'todos'}"}
