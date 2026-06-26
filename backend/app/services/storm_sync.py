"""
Sincronização de contratos Storm → propostas locais.

Fluxo:
  1. Busca contratos paginados da API Storm (/contratos)
  2. Mapeia para o modelo Proposta via storm_adapter.mapear_contrato()
  3. Ignora contratos já importados (idempotência via proposta_id_externo)
  4. Processa cada nova proposta pelo motor antifraude
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.logging import log
from app.database import SessionLocal
from app.models import Proposta, StatusProposta, TipoEvento
from app.services.auditoria import AuditoriaService
from app.services.storm import StormService, StormAPIError
from app.services.storm_adapter import mapear_contrato


def _processar(proposta_id: str) -> None:
    from app.routers.propostas import processar_proposta
    processar_proposta.apply_async(args=[proposta_id], queue="propostas")


def _extrair_lista(resp: Any) -> list[dict]:
    """Extrai lista de contratos de qualquer formato de resposta Storm."""
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for key in ("data", "contratos", "content", "items", "result"):
            v = resp.get(key)
            if isinstance(v, list):
                return v
    return []


def _total_paginas(resp: Any) -> int | None:
    """Detecta total de páginas da resposta paginada Storm."""
    if isinstance(resp, dict):
        for key in ("total_paginas", "totalPages", "last_page"):
            v = resp.get(key)
            if isinstance(v, int):
                return v
    return None


async def sincronizar(
    max_paginas: int = 20,
    id_banco: int | None = None,
    id_status: int | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
) -> dict[str, int]:
    """
    Busca contratos do Storm e importa os novos como propostas.

    Parâmetros:
      id_banco     — filtrar por banco Storm (ID numérico)
      id_status    — filtrar por status do contrato Storm
      data_inicio  — formato aceito pela API Storm (ex: "2026-06-01")
      data_fim     — formato aceito pela API Storm (ex: "2026-06-30")

    Retorna contadores: importadas, ignoradas (já existiam), erros.
    """
    importadas = 0
    ignoradas = 0
    erros = 0

    db = SessionLocal()
    try:
        async with StormService() as storm:
            for pagina in range(1, max_paginas + 1):
                try:
                    resp: Any = await storm.get_contratos(
                        pagina=pagina,
                        id_banco=id_banco,
                        id_status=id_status,
                        data_inicio=data_inicio,
                        data_fim=data_fim,
                    )
                except StormAPIError as exc:
                    log.error("storm_sync.fetch_erro", pagina=pagina, error=str(exc))
                    break

                contratos = _extrair_lista(resp)
                if not contratos:
                    break

                for raw in contratos:
                    dados = mapear_contrato(raw)
                    if dados is None:
                        erros += 1
                        continue

                    id_externo = dados["proposta_id_externo"]
                    existente = db.query(Proposta).filter(
                        Proposta.proposta_id_externo == id_externo
                    ).first()

                    if existente:
                        ignoradas += 1
                        continue

                    proposta = Proposta(**dados)
                    proposta.status = StatusProposta.ENFILEIRADA
                    db.add(proposta)
                    try:
                        db.flush()
                    except Exception:
                        db.rollback()
                        erros += 1
                        continue

                    audit = AuditoriaService(db)
                    audit.registrar(proposta.id, TipoEvento.CRIACAO, dados={"fonte": "storm_sync"})
                    audit.registrar(proposta.id, TipoEvento.ENFILEIRAMENTO)
                    db.commit()

                    _processar(proposta.id)
                    importadas += 1
                    log.info("storm_sync.importada", id_externo=id_externo, proposta_id=proposta.id)

                total_pags = _total_paginas(resp)
                if total_pags is not None and pagina >= total_pags:
                    break

                await asyncio.sleep(0.5)

    finally:
        db.close()

    log.info("storm_sync.concluida", importadas=importadas, ignoradas=ignoradas, erros=erros)
    return {"importadas": importadas, "ignoradas": ignoradas, "erros": erros}
