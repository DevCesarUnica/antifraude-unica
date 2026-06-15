"""
Router Titan — expõe dados de referência e status do circuit breaker.
"""

from fastapi import APIRouter, HTTPException
from app.services.titan import TitanService, TitanAPIError

router = APIRouter(prefix="/titan", tags=["titan"])


@router.get("/status")
async def status_titan():
    async with TitanService() as titan:
        return titan.status()


@router.get("/bancos")
async def listar_bancos(force_refresh: bool = False):
    try:
        async with TitanService() as titan:
            return await titan.get_banks(force_refresh)
    except TitanAPIError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/referencia")
async def dados_referencia(force_refresh: bool = False):
    """Todos os dados de referência em paralelo (bancos, sexos, estados civis, profissões, produtos)."""
    try:
        async with TitanService() as titan:
            return await titan.get_all(force_refresh)
    except TitanAPIError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.delete("/cache")
async def invalidar_cache(endpoint: str | None = None):
    async with TitanService() as titan:
        await titan.invalidar_cache(endpoint)
    return {"mensagem": f"Cache invalidado: {endpoint or 'todos'}"}
