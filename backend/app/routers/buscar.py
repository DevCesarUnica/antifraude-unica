"""
Busca global de contratos por número.

Estratégia de prioridade:
  1. Hope/Titan  — prioridade máxima (lookup direto por ID numérico)
  2. Storm       — secundário (só se formato FF-DD/MM/YYYY-N detectado)
  3. Banco local — complemento (proposta_id_externo LIKE %numero%)

Nunca lança 4xx/5xx se uma fonte estiver offline — retorna null para ela
e continua com as demais (fail gracefully).
"""
from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Proposta
from app.services.titan import TitanService, TitanAPIError
from app.services.storm import StormService, StormAPIError

router = APIRouter(prefix="/buscar", tags=["buscar"])

_FF_RE = re.compile(r"^FF-\d{2}/\d{2}/\d{4}-\d+$", re.IGNORECASE)


# ── Normalizadores ────────────────────────────────────────────────────────────

def _fmt_valor(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_cpf(raw: str | None) -> str:
    if not raw:
        return "—"
    d = re.sub(r"\D", "", raw)
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return raw


def _normalizar_hope(op: dict) -> dict:
    customer = op.get("customer") or {}
    person   = customer.get("person") or {}
    product  = op.get("product") or {}
    company  = op.get("originatingCompany") or {}
    status   = op.get("operationStatus") or {}
    valor    = float(op.get("requestedValue") or 0)
    return {
        "origem":           "hope",
        "id":               str(op.get("id", "")),
        "codigo_operacao":  str(op.get("operationCode") or ""),
        "cliente":          person.get("fullName") or "—",
        "cpf":              _fmt_cpf(person.get("documentNumber")),
        "valor":            valor,
        "valor_fmt":        _fmt_valor(valor),
        "produto":          product.get("name") or "—",
        "status":           status.get("text") or "—",
        "banco":            "HOPE",
        "convenio":         company.get("tradeName") or "—",
        "criado_em":        op.get("createdAt") or None,
    }


def _normalizar_storm(raw: dict) -> dict:
    from app.services.storm_adapter import (
        extrair_banco, extrair_convenio, extrair_produto,
        extrair_cpf, extrair_nome_cliente, extrair_valor, extrair_id_contrato,
    )
    valor = float(extrair_valor(raw) or 0)
    status_obj = raw.get("status") or {}
    status_txt = (
        status_obj.get("nome") if isinstance(status_obj, dict)
        else str(status_obj)
    ) or "—"
    return {
        "origem":           "storm",
        "id":               extrair_id_contrato(raw) or str(raw.get("id", "")),
        "codigo_operacao":  str((raw.get("operacao") or {}).get("codigo") or ""),
        "cliente":          extrair_nome_cliente(raw) or "—",
        "cpf":              _fmt_cpf(extrair_cpf(raw)),
        "valor":            valor,
        "valor_fmt":        _fmt_valor(valor),
        "produto":          extrair_produto(raw) or "—",
        "status":           status_txt,
        "banco":            extrair_banco(raw),
        "convenio":         extrair_convenio(raw) or "—",
        "criado_em":        raw.get("criado_em") or raw.get("data_cadastro") or None,
    }


def _normalizar_local(p: Proposta) -> dict:
    valor = float(p.valor or 0)
    return {
        "origem":     "local",
        "id":         str(p.id),
        "id_externo": p.proposta_id_externo,
        "cliente":    p.nome_cliente or "—",
        "cpf":        _fmt_cpf(p.cpf_cliente),
        "valor":      valor,
        "valor_fmt":  _fmt_valor(valor),
        "produto":    p.produto or "—",
        "status":     p.status.value if p.status else "—",
        "banco":      p.banco or "—",
        "convenio":   p.convenio or "—",
        "criado_em":  p.criado_em.isoformat() if p.criado_em else None,
    }


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/contrato")
async def buscar_contrato(
    numero: str = Query(..., min_length=1, description="ID Hope (ex: 76525) ou código FF Storm (ex: FF-29/06/2026-1)"),
    db: Session = Depends(get_db),
):
    """
    Busca um contrato por número em todas as fontes disponíveis.

    Hope retorna primeiro (prioridade). Storm e banco local complementam.
    Fontes offline retornam null sem interromper a busca.
    """
    numero = numero.strip()
    is_numeric = numero.isdigit()
    is_ff      = bool(_FF_RE.match(numero))

    hope_resultado:  dict | None = None
    storm_resultado: dict | None = None
    local_resultados: list[dict] = []
    fontes_erro: list[str] = []

    # ── 1. Hope (prioridade) ──────────────────────────────────────────────────
    if is_numeric:
        try:
            async with TitanService() as titan:
                op = await titan.get_operation(numero)
            if op and op.get("id"):
                hope_resultado = _normalizar_hope(op)
        except TitanAPIError:
            fontes_erro.append("hope")
        except Exception:
            fontes_erro.append("hope")

    # ── 2. Storm (formato FF) ─────────────────────────────────────────────────
    if is_ff:
        try:
            async with StormService() as storm:
                resp = await storm.get_contratos(ff=numero)
            items: list[Any] = resp.get("data") or []
            if items and isinstance(items[0], dict):
                storm_resultado = _normalizar_storm(items[0])
        except StormAPIError:
            fontes_erro.append("storm")
        except Exception:
            fontes_erro.append("storm")

    # ── 3. Banco local ────────────────────────────────────────────────────────
    try:
        rows = (
            db.query(Proposta)
            .filter(Proposta.proposta_id_externo.ilike(f"%{numero}%"))
            .order_by(Proposta.criado_em.desc())
            .limit(5)
            .all()
        )
        local_resultados = [_normalizar_local(p) for p in rows]
    except Exception:
        fontes_erro.append("local")

    total = (
        (1 if hope_resultado else 0)
        + (1 if storm_resultado else 0)
        + len(local_resultados)
    )

    return {
        "numero_buscado": numero,
        "total_encontrados": total,
        "hope":  hope_resultado,
        "storm": storm_resultado,
        "local": local_resultados,
        "fontes_com_erro": fontes_erro,
    }
