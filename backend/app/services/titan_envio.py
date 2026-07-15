"""
Serviço de envio de propostas aprovadas para a API Titan (Hope).
Implementa POST /api/operations/create com retry, idempotência e logging.

Referência completa: TITAN_API_ENVIO.txt na raiz do projeto.
"""

import asyncio
import hashlib
import logging
from datetime import date

import httpx

logger = logging.getLogger(__name__)

# ── Mapeamentos de IDs (ajustar conforme catálogo real do Titan) ──────────────
# Consultar: GET /titan/bancos e GET /titan/bancos/{id}/produtos

PRODUTO_MAP: dict[str, int] = {
    "credito_pessoal": 4401,
    "consignado":      5501,
    "fgts":            6601,
    "clt":             4401,
    "margem":          4401,
    "refinanciamento": 4401,
}

BANCO_MAP: dict[str, dict] = {
    "hope":  {"companyID": 7701, "companyType": "CS"},
    "titan": {"companyID": 7701, "companyType": "CS"},
    "storm": {"companyID": 7253, "companyType": "AO"},
}

OPERATION_STATUS_PF = 19
OPERATION_STATUS_PJ = 6


# ── Extração de dados financeiros do payload_original ────────────────────────

def extrair_calculo_de_payload(payload: dict | None) -> dict | None:
    """
    Extrai dados financeiros calculados do payload_original de uma proposta Titan.

    O payload_original é a resposta bruta do GET /api/operations/{id} da API Titan,
    armazenado quando a proposta foi importada via /titan/sync.
    Contém todos os campos necessários para re-criar a operação com status aprovado.

    Retorna None se campos mínimos obrigatórios estiverem ausentes.
    """
    if not payload:
        return None

    parcelas = payload.get("installments") or []
    primeiro_vencimento = (
        payload.get("firstDueDate")
        or (parcelas[0].get("dueDate") if parcelas else None)
    )

    calculo = {
        "primeiro_vencimento": primeiro_vencimento,
        "num_parcelas":        payload.get("installmentQuantity"),
        "taxa_mensal":         (payload.get("monthlyInterestRate") or 0) * 100,
        "cet_mensal":          (payload.get("monthlyTEC") or 0) * 100,
        "cet_anual":           (payload.get("yearlyTEC") or 0) * 100,
        "valor_parcela":       payload.get("installmentValueWithIOF"),
        "iof_total":           payload.get("totalIOFValue"),
        "iof_financiado":      payload.get("financedIOFValue"),
        "carencia_dias":       payload.get("gracePeriod") or 30,
        "valor_total":         payload.get("totalValue"),
        "valor_financiado":    payload.get("financedValue"),
        "entrada":             payload.get("downPayment") or 0,
        "tfc":                 payload.get("tfc") or 0,
        "tfc_pct":             payload.get("tfcPct") or 0,
        "seguro_pct":          payload.get("creditLifeInsurancePct") or 0,
        "seguro_valor":        payload.get("creditLifeInsurance") or 0,
        "parcelas":            parcelas,
    }

    campos_obrigatorios = [
        calculo["primeiro_vencimento"],
        calculo["num_parcelas"],
        calculo["valor_total"],
        calculo["valor_financiado"],
    ]
    if not all(campos_obrigatorios):
        return None

    return calculo


# ── Montagem do payload para a API ───────────────────────────────────────────

def montar_payload_titan(proposta, calculo: dict) -> dict:
    """
    Monta o payload completo para POST /api/operations/create da API Titan.

    proposta : objeto SQLAlchemy Proposta
    calculo  : dict extraído de extrair_calculo_de_payload() ou fornecido manualmente
    """
    banco_lower = (proposta.banco or "hope").lower()
    banco_cfg = BANCO_MAP.get(banco_lower, {"companyID": 7701, "companyType": "CS"})
    produto_lower = (proposta.produto or "").lower().replace(" ", "_")
    produto_id = PRODUTO_MAP.get(produto_lower, 4401)

    # Dados do cliente e da operação do payload_original (quando disponível)
    payload_orig = proposta.payload_original or {}
    customer_orig = payload_orig.get("customer") or {}
    person_orig   = customer_orig.get("person") or {}
    accounts_orig = person_orig.get("accounts") or []
    address_orig  = person_orig.get("address") or {}

    customer = {
        "person": {
            "email":             person_orig.get("email") or f"{proposta.cpf_cliente}@noreply.com",
            "fullName":          person_orig.get("fullName") or (proposta.nome_cliente or ""),
            "documentNumber":    person_orig.get("documentNumber") or proposta.cpf_cliente,
            "mobilePhoneNumber": person_orig.get("mobilePhoneNumber") or "",
            "birthdate":         person_orig.get("birthdate"),
            "declaredIncome":    float(person_orig.get("declaredIncome") or 0),
            "accounts": accounts_orig or [{
                "agencyNumber":       "0001",
                "accountNumber":      "000000",
                "accountNumberDigit": "0",
                "accountTypeID":      1,
                "bankCode":           237,
                "primaryAccount":     True,
            }],
            "address": address_orig or {
                "postalCode":       "00000000",
                "countryID":        1,
                "level1AdminDivID": 10,
                "level2AdminDivID": 990,
                "line1":            "",
                "houseNumber":      "S/N",
                "neighborhood":     "",
            },
            "occupations":    person_orig.get("occupations") or [],
            "socialNetworks": person_orig.get("socialNetworks") or [],
        },
        "company": None,
    }

    return {
        "acceptanceDate":              date.today().isoformat(),
        "firstDueDate":                calculo["primeiro_vencimento"],
        "installmentQuantity":         int(calculo["num_parcelas"]),
        "requestedValue":              float(proposta.valor),
        "downPayment":                 float(calculo.get("entrada") or 0),
        "paymentFrequencyID":          payload_orig.get("paymentFrequencyID") or 51,
        "paymentMethodID":             payload_orig.get("paymentMethodID") or 2,
        "productID":                   payload_orig.get("productID") or produto_id,
        "operationStatusID":           OPERATION_STATUS_PF,
        "companyID":                   payload_orig.get("companyID") or banco_cfg["companyID"],
        "companyType":                 payload_orig.get("companyType") or banco_cfg["companyType"],
        "inPersonSale":                payload_orig.get("inPersonSale") or False,
        "monthlyInterestRate":         calculo["taxa_mensal"] / 100,
        "monthlyTEC":                  calculo["cet_mensal"] / 100,
        "yearlyTEC":                   calculo["cet_anual"] / 100,
        "installmentValueWithIOF":     float(calculo["valor_parcela"] or 0),
        "iofRate":                     payload_orig.get("iofRate") or 0.000082,
        "additionalIOFRate":           payload_orig.get("additionalIOFRate") or 0.0038,
        "totalIOFValue":               float(calculo["iof_total"] or 0),
        "financedIOFValue":            float(calculo["iof_financiado"] or 0),
        "gracePeriod":                 int(calculo.get("carencia_dias") or 30),
        "totalValue":                  float(calculo["valor_total"]),
        "financedValue":               float(calculo["valor_financiado"]),
        "tfc":                         float(calculo.get("tfc") or 0),
        "tfcPct":                      float(calculo.get("tfc_pct") or 0),
        "creditLifeInsurancePct":      float(calculo.get("seguro_pct") or 0),
        "creditLifeInsurance":         float(calculo.get("seguro_valor") or 0),
        "additionalInsuranceValue":    0.0,
        "financeIOF":                  True,
        "financeTFC":                  True,
        "financeCreditLifeInsurance":  True,
        "financeAdditionalInsurance":  False,
        "customer":     customer,
        "guarantors":   [],
        "collaterals":  [],
        "installments": calculo.get("parcelas") or [],
    }


# ── Chamada à API ─────────────────────────────────────────────────────────────

def _gerar_idempotency_key(proposta_id_externo: str, cpf: str, valor: float) -> str:
    raw = f"{proposta_id_externo}:{cpf}:{valor}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def enviar_para_titan(
    proposta,
    calculo: dict,
    base_url: str,
    api_key: str,
    max_retries: int = 3,
    timeout_seconds: int = 30,
) -> dict:
    """
    Envia proposta aprovada para a API Titan via POST /api/operations/create.

    Retorna dict com:
      status        : "APROVADA" | "DUPLICADA" | "RECUSADA" | "ERRO_API"
      operation_id  : int | None
      mensagem      : str
      raw_response  : dict | None
    """
    idempotency_key = _gerar_idempotency_key(
        proposta.proposta_id_externo,
        proposta.cpf_cliente,
        proposta.valor,
    )
    payload = montar_payload_titan(proposta, calculo)

    headers = {
        "Content-Type":      "application/json",
        "Titan-Api-Key":     api_key,
        "X-Idempotency-Key": idempotency_key,
    }

    ctx = {
        "ade":             proposta.proposta_id_externo,
        "banco":           proposta.banco,
        "valor":           proposta.valor,
        "idempotency_key": idempotency_key,
    }

    logger.info("Enviando proposta ao Titan", extra=ctx)

    for tentativa in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=float(timeout_seconds)) as client:
                response = await client.post(
                    f"{base_url}/operations/create",
                    headers=headers,
                    json=payload,
                )

            logger.info(
                "Resposta Titan",
                extra={**ctx, "http_status": response.status_code, "tentativa": tentativa}
            )

            # ── Sucesso ────────────────────────────────────────────────────────
            if response.status_code == 201:
                data = response.json()
                op_id = (data.get("data") or {}).get("id") or data.get("id")
                logger.info("Proposta enviada com sucesso", extra={**ctx, "operation_id": op_id})
                return {
                    "status":       "APROVADA",
                    "operation_id": op_id,
                    "mensagem":     "Operação criada com sucesso no Titan",
                    "raw_response": data,
                }

            # ── Duplicata (idempotência) ───────────────────────────────────────
            if response.status_code == 409:
                data = response.json()
                op_id = (data.get("data") or {}).get("id") or data.get("id")
                logger.warning("Proposta duplicada no Titan", extra=ctx)
                return {
                    "status":       "DUPLICADA",
                    "operation_id": op_id,
                    "mensagem":     "Operação já existe no Titan (idempotente)",
                    "raw_response": data,
                }

            # ── Erro de negócio (não fazer retry) ────────────────────────────
            if response.status_code in (400, 401, 403, 422):
                try:
                    erro = response.json()
                except Exception:
                    erro = {"detail": response.text}
                logger.error("Titan recusou a proposta", extra={**ctx, "erro": erro})
                return {
                    "status":       "RECUSADA",
                    "operation_id": None,
                    "mensagem":     f"HTTP {response.status_code}: {erro}",
                    "raw_response": erro,
                }

            # ── Erro de servidor (retry com backoff) ──────────────────────────
            if response.status_code >= 500:
                logger.warning(
                    f"Erro 5xx na tentativa {tentativa}/{max_retries}",
                    extra={**ctx, "http_status": response.status_code}
                )
                if tentativa < max_retries:
                    await asyncio.sleep(2 ** tentativa)
                    continue
                return {
                    "status":       "ERRO_API",
                    "operation_id": None,
                    "mensagem":     f"Titan indisponível após {max_retries} tentativas (HTTP {response.status_code})",
                    "raw_response": None,
                }

        except httpx.TimeoutException:
            logger.warning(f"Timeout na tentativa {tentativa}/{max_retries}", extra=ctx)
            if tentativa < max_retries:
                await asyncio.sleep(2 ** tentativa)
                continue
            return {
                "status":       "ERRO_API",
                "operation_id": None,
                "mensagem":     f"Timeout ao conectar ao Titan após {max_retries} tentativas",
                "raw_response": None,
            }

        except httpx.RequestError as exc:
            logger.error(f"Erro de conexão ao Titan: {exc}", extra=ctx)
            return {
                "status":       "ERRO_API",
                "operation_id": None,
                "mensagem":     f"Erro de conexão: {exc}",
                "raw_response": None,
            }

    return {
        "status":       "ERRO_API",
        "operation_id": None,
        "mensagem":     "Máximo de tentativas atingido",
        "raw_response": None,
    }
