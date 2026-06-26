"""
Adapter Storm Tecnologia → formato interno Proposta.

Converte contratos/operações da API Storm para o schema PropostaCreate.
Banco NUNCA é hardcodado — extraído dinamicamente do payload Storm.

Formatos mapeados:
  /antifraude/listar_contratos  → contratos da fila de antifraude
  /contratos                    → contratos gerais
  /clientes/cpf                 → contratos embutidos no cliente
"""
from __future__ import annotations

import re
from typing import Any


# ── Helpers ───────────────────────────────────────────────────────────────────

def _str(*candidates: Any) -> str:
    """Retorna o primeiro valor string não-vazio."""
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


def _num(*candidates: Any) -> float | None:
    """Retorna o primeiro número > 0."""
    for v in candidates:
        if v is None or v in ("", "0.00", 0, 0.0):
            continue
        try:
            if isinstance(v, str):
                n = float(v.replace(".", "").replace(",", "."))
            else:
                n = float(v)
            if n > 0:
                return n
        except (ValueError, TypeError):
            continue
    return None


def _obj(d: dict, key: str) -> dict:
    """Retorna sub-dict seguro (nunca None ou lista)."""
    v = d.get(key)
    return v if isinstance(v, dict) else {}


def _cpf_digits(v: str | None) -> str | None:
    if not v:
        return None
    digits = re.sub(r"\D", "", v)
    return digits if len(digits) in (11, 14) else None


# ── Extratores de campo ───────────────────────────────────────────────────────

def extrair_banco(raw: dict) -> str:
    """
    Extrai nome do banco do payload Storm.
    Tenta múltiplos campos em ordem de confiabilidade.
    NUNCA retorna "HOPE" — esse hardcode só existe em hope_adapter.py.
    """
    banco_obj = _obj(raw, "banco")
    nome = _str(
        banco_obj.get("nome"),
        banco_obj.get("name"),
        banco_obj.get("ba_nome"),
        raw.get("banco_nome"),
        raw.get("ba_nome"),
        raw.get("nm_banco"),
        raw.get("ds_banco"),
    )
    if not nome:
        conv_obj = _obj(raw, "convenio")
        nome = _str(conv_obj.get("banco"), conv_obj.get("banco_nome"))
    return nome or "Não informado"


def extrair_convenio(raw: dict) -> str | None:
    conv_obj = _obj(raw, "convenio")
    orgao_obj = _obj(raw, "orgao")
    cl_obj = _obj(raw, "cliente")
    orgao_nested = _obj(cl_obj, "orgao")
    return _str(
        conv_obj.get("nome"),
        conv_obj.get("descricao"),
        orgao_obj.get("nome"),
        orgao_nested.get("nome"),
        raw.get("convenio_nome"),
        raw.get("nm_convenio"),
    ) or None


def extrair_produto(raw: dict) -> str | None:
    op_obj = _obj(raw, "operacao")
    return _str(
        op_obj.get("nome"),
        op_obj.get("descricao"),
        raw.get("operacao_nome"),
        raw.get("produto"),
        raw.get("tabela_nome"),
        raw.get("pr_nome"),
    ) or None


def extrair_cpf(raw: dict) -> str | None:
    """Extrai CPF de qualquer formato Storm. Retorna None se inválido."""
    cc = _obj(raw, "cliente_contrato")
    cd = _obj(raw, "clienteDados")
    cl = _obj(raw, "cliente")
    candidate = _str(
        cc.get("cpf"),
        cd.get("cpf"),
        cl.get("cpf"),
        raw.get("cpf"),
        raw.get("nu_cpf"),
        raw.get("cpf_cliente"),
    )
    return _cpf_digits(candidate)


def extrair_nome_cliente(raw: dict) -> str | None:
    cc = _obj(raw, "cliente_contrato")
    cd = _obj(raw, "clienteDados")
    cl = _obj(raw, "cliente")
    return _str(
        cc.get("nome"),
        cd.get("clienteNome"),
        cl.get("nome"),
        raw.get("nome"),
        raw.get("nm_cliente"),
        raw.get("nome_cliente"),
    ) or None


def extrair_uf_cliente(raw: dict) -> str | None:
    end = _obj(raw, "endereco")
    cl = _obj(raw, "cliente")
    end_cl = _obj(cl, "endereco")
    return _str(
        end.get("uf"),
        end_cl.get("uf"),
        raw.get("uf"),
        raw.get("uf_cliente"),
    ) or None


def extrair_valor(raw: dict) -> float | None:
    return _num(
        raw.get("valor_operacao"),
        raw.get("producao_bruta"),
        raw.get("valor_bruto"),
        raw.get("valor_liquido"),
        raw.get("valor_negociado"),
        raw.get("valor_liberado"),
        raw.get("valor"),
    )


def extrair_id_contrato(raw: dict) -> str | None:
    """Retorna o código único do contrato Storm (ff, codigo ou id)."""
    return _str(
        raw.get("ff"),
        raw.get("codigo"),
        raw.get("id"),
        raw.get("id_contrato"),
        raw.get("co_contrato"),
    ) or None


# ── Mapeamento principal ──────────────────────────────────────────────────────

def mapear_contrato(raw: dict) -> dict | None:
    """
    Converte um contrato Storm para o formato PropostaCreate interno.

    Compatível com:
      - /contratos (response.data[])
      - /antifraude/listar_contratos (response direto)
      - /clientes/cpf (contratos embutidos)

    Retorna None se CPF, valor ou código estiverem ausentes.
    """
    ff = extrair_id_contrato(raw)
    if not ff:
        return None

    cpf = extrair_cpf(raw)
    if not cpf:
        return None

    valor = extrair_valor(raw)
    if not valor or valor <= 0:
        return None

    return {
        "proposta_id_externo": f"storm-{ff}",
        "cpf_cliente": cpf,
        "nome_cliente": extrair_nome_cliente(raw),
        "uf_cliente": extrair_uf_cliente(raw),
        "banco": extrair_banco(raw),          # dinâmico — nunca "HOPE"
        "convenio": extrair_convenio(raw),
        "produto": extrair_produto(raw),
        "valor": float(valor),
        "payload_original": raw,
    }
