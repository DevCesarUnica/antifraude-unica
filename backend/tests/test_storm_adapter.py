"""
Testes do adapter Storm (app/services/storm_adapter.py). Funções puras, sem
banco — cobre a invariante documentada em ONBOARDING_DESENVOLVEDOR.txt
REGRA 6: extrair_banco() nunca pode retornar "HOPE", já que a Storm é um hub
multibanco (BMG, Pan, etc.), nunca o próprio Hope.
"""
from app.services.storm_adapter import extrair_banco, mapear_contrato


def _payload(**overrides):
    base = {
        "ff": "FF-29/06/2026-1",
        "cliente": {"cpf": "111.222.333-44", "nome": "Fulano de Tal"},
        "banco": {"nome": "BMG"},
        "convenio": {"nome": "INSS"},
        "valor_operacao": 5000.0,
    }
    base.update(overrides)
    return base


def test_id_externo_prefixo_storm():
    resultado = mapear_contrato(_payload())
    assert resultado["proposta_id_externo"] == "storm-FF-29/06/2026-1"


def test_banco_extraido_do_payload():
    resultado = mapear_contrato(_payload())
    assert resultado["banco"] == "BMG"


def test_extrair_banco_nunca_retorna_hope():
    payloads_variados = [
        {"banco": {"nome": "HOPE"}},
        {"banco_nome": "hope"},
        {"ba_nome": "Hope Financeira"},
        {},
    ]
    for raw in payloads_variados:
        banco = extrair_banco(raw)
        assert banco.upper() != "HOPE", f"extrair_banco retornou HOPE para payload {raw}"


def test_retorna_none_sem_ff():
    payload = _payload(ff=None, codigo=None, id=None)
    assert mapear_contrato(payload) is None


def test_retorna_none_sem_cpf_valido():
    payload = _payload()
    payload["cliente"]["cpf"] = None
    assert mapear_contrato(payload) is None


def test_retorna_none_sem_valor():
    payload = _payload(valor_operacao=None)
    assert mapear_contrato(payload) is None
