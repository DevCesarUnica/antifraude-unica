"""
Adapter Hope/Titan → formato interno Proposta.

Hope é um banco específico integrado via API Titan (Ceoslab).
Este é o ÚNICO lugar onde banco = "HOPE" é hardcodado — correto por design,
pois Titan/Ceoslab é exclusivamente o sistema do banco Hope.

Consolida a lógica de _map_operacao() de titan_sync.py em camada reutilizável.
"""
from __future__ import annotations

import re
from typing import Any


# ── Helpers ───────────────────────────────────────────────────────────────────

def _str(*candidates: Any) -> str:
    for v in candidates:
        if v is None or v == "":
            continue
        if isinstance(v, str):
            s = v.strip()
            if s:
                return s
        if isinstance(v, (int, float)):
            return str(v)
    return ""


def _cpf_digits(v: str | None) -> str | None:
    if not v:
        return None
    digits = re.sub(r"\D", "", v)
    return digits if len(digits) in (11, 14) else None


def _first_address(addresses: list) -> dict:
    if addresses and isinstance(addresses[0], dict):
        return addresses[0]
    return {}


# ── Mapeamento principal ──────────────────────────────────────────────────────

def mapear_operacao(op: dict) -> dict | None:
    """
    Converte uma operação da API Titan para o formato PropostaCreate interno.

    banco = "HOPE" é INTENCIONAL aqui — Titan é o sistema exclusivo do
    banco Hope. Este é o único local do código onde esse hardcode é válido.

    Retorna None se CPF, valor ou ID estiverem ausentes.
    """
    op_id = op.get("id")
    if not op_id:
        return None

    customer    = op.get("customer") or {}
    person      = customer.get("person") or {}
    product     = op.get("product") or {}
    originating = op.get("originatingCompany") or {}
    addresses   = person.get("addresses") or []
    address     = _first_address(addresses)

    cpf = _cpf_digits(person.get("documentNumber"))
    if not cpf:
        return None

    valor = op.get("requestedValue") or 0.0
    if float(valor) <= 0:
        return None

    return {
        "proposta_id_externo": f"titan-{op_id}",
        "cpf_cliente": cpf,
        "nome_cliente": _str(person.get("fullName")) or None,
        "uf_cliente": _str(address.get("state")) or None,
        "banco": "HOPE",            # INTENCIONAL — Titan/Ceoslab = banco Hope
        "convenio": _str(originating.get("tradeName")) or None,
        "produto": _str(product.get("name")) or None,
        "valor": float(valor),
        "payload_original": op,
    }
