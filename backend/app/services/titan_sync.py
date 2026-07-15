"""
Sincronização de operações do Titan (Hope/Ceoslab) → propostas locais.

Fluxo:
  1. Busca operações paginadas da API Titan
  2. Mapeia para o modelo Proposta
  3. Ignora operações já importadas (idempotência via proposta_id_externo)
  4. Processa cada nova proposta pelo motor antifraude
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.logging import log
from app.database import SessionLocal
from app.models import Proposta, StatusProposta, TipoEvento
from app.services.auditoria import AuditoriaService
from app.services.hope_adapter import mapear_operacao
from app.services.titan import TitanService, TitanAPIError


def _processar(proposta_id: str) -> None:
    from app.routers.propostas import processar_proposta
    processar_proposta.apply_async(args=[proposta_id], queue="propostas")




async def sincronizar(
    page_size: int = 50,
    max_pages: int = 20,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    status_id: int | None = None,
) -> dict[str, int]:
    """
    Busca operações do Titan e importa as novas como propostas.

    Parâmetros:
      data_inicio  — ISO 8601 com timezone, ex: "2026-06-01T00:00:00-03:00"
      data_fim     — ISO 8601 com timezone, ex: "2026-06-30T23:59:59-03:00"
      status_id    — ID do status Titan para filtrar (ex: 23 = Pago)

    Retorna contadores: importadas, ignoradas (já existiam), erros.
    """
    importadas = 0
    ignoradas = 0
    erros = 0

    db = SessionLocal()
    try:
        async with TitanService() as titan:
            for page_num in range(0, max_pages):
                # API Titan usa pageNumber base-0 e sort=campo,DIRECAO
                endpoint = (
                    f"/operations?pageNumber={page_num}&pageSize={page_size}"
                    f"&sort=id,DESC"
                )
                if data_inicio:
                    endpoint += f"&filters[createdAt][$gte]={data_inicio}"
                if data_fim:
                    endpoint += f"&filters[createdAt][$lte]={data_fim}"
                if status_id:
                    endpoint += f"&filters[operationStatusID][$eq]={status_id}"

                try:
                    resp: Any = await titan._fetch(endpoint)
                except TitanAPIError as exc:
                    log.error("titan_sync.fetch_erro", page=page_num, error=str(exc))
                    break

                items = resp.get("content", []) if isinstance(resp, dict) else resp
                if not items:
                    break

                for op in items:
                    dados = mapear_operacao(op)
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
                    audit.registrar(proposta.id, TipoEvento.CRIACAO, dados={"fonte": "titan_sync"})
                    audit.registrar(proposta.id, TipoEvento.ENFILEIRAMENTO)
                    db.commit()

                    _processar(proposta.id)
                    importadas += 1
                    log.info("titan_sync.importada", id_externo=id_externo, proposta_id=proposta.id)

                total_pages = resp.get("totalPages") if isinstance(resp, dict) else None
                if total_pages is not None and page_num >= total_pages - 1:
                    break

                await asyncio.sleep(0.5)

    finally:
        db.close()

    log.info("titan_sync.concluida", importadas=importadas, ignoradas=ignoradas, erros=erros)
    return {"importadas": importadas, "ignoradas": ignoradas, "erros": erros}
