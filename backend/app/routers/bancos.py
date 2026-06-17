"""
Router /bancos — gerencia integrações bancárias.

Endpoints:
  GET  /bancos/                    lista bancos configurados
  GET  /bancos/{slug}/status       health check da integração
  GET  /bancos/{slug}/produtos     lista produtos do banco
  GET  /bancos/{slug}/referencia   dados de referência (bancos, profissões, etc.)
"""
from fastapi import APIRouter, HTTPException
from app.services.banks.registry import get_adapter, list_adapters

router = APIRouter(prefix="/bancos", tags=["bancos"])


@router.get("/")
async def listar_bancos():
    """Lista todos os bancos integrados com metadados básicos."""
    return [
        {"slug": a.slug, "nome": a.nome, "tipo": a.tipo}
        for a in list_adapters()
    ]


@router.get("/{slug}/status")
async def status_banco(slug: str):
    """Health check da integração com o banco."""
    try:
        adapter = get_adapter(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return await adapter.health_check()


@router.get("/{slug}/produtos")
async def produtos_banco(slug: str):
    """Lista produtos disponíveis no banco."""
    try:
        adapter = get_adapter(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    try:
        return await adapter.get_produtos()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{slug}/referencia")
async def referencia_banco(slug: str, force_refresh: bool = False):
    """
    Dados de referência do banco (bancos, sexos, estados civis, profissões, produtos).
    Suportado por bancos que expõem catálogo via API (ex: Hope/Titan).
    """
    try:
        adapter = get_adapter(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Passa force_refresh se o adapter suportar
    import inspect
    sig = inspect.signature(adapter.get_referencia)
    if "force_refresh" in sig.parameters:
        dados = await adapter.get_referencia(force_refresh=force_refresh)  # type: ignore[call-arg]
    else:
        dados = await adapter.get_referencia()

    return dados
