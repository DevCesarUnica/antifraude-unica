"""
Testes do adapter Hope/Titan (app/services/hope_adapter.py). Funções puras,
sem banco — cobre as invariantes documentadas em ONBOARDING_DESENVOLVEDOR.txt
REGRA 1 (banco="HOPE" só pode ser hardcodado aqui) e REGRA 4 (formato de
proposta_id_externo).
"""
from app.services.hope_adapter import mapear_operacao


def _payload(**overrides):
    base = {
        "id": 76525,
        "customer": {"person": {"documentNumber": "111.222.333-44", "fullName": "Fulano de Tal",
                                 "addresses": [{"state": "SP"}]}},
        "product": {"name": "Consignado"},
        "originatingCompany": {"tradeName": "ESTADO DE SAO PAULO"},
        "requestedValue": 5000.0,
    }
    base.update(overrides)
    return base


def test_banco_sempre_hope():
    resultado = mapear_operacao(_payload())
    assert resultado["banco"] == "HOPE"


def test_id_externo_prefixo_titan():
    resultado = mapear_operacao(_payload(id=76525))
    assert resultado["proposta_id_externo"] == "titan-76525"


def test_cpf_extraido_sem_mascara():
    resultado = mapear_operacao(_payload())
    assert resultado["cpf_cliente"] == "11122233344"


def test_retorna_none_sem_id():
    assert mapear_operacao(_payload(id=None)) is None


def test_retorna_none_sem_cpf_valido():
    payload = _payload()
    payload["customer"]["person"]["documentNumber"] = "123"
    assert mapear_operacao(payload) is None


def test_retorna_none_valor_zero():
    assert mapear_operacao(_payload(requestedValue=0)) is None
