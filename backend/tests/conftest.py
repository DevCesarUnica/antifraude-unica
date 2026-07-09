"""
Fixtures de teste. Roda contra o Postgres real configurado em backend/.env —
este projeto não usa SQLite em nenhum ambiente (ver ONBOARDING_DESENVOLVEDOR.txt,
seção "Por que SQLite não é usado mesmo em dev"), então os testes seguem a
mesma regra: cada teste abre uma transação e faz rollback no final, nada
commitado permanece no banco.
"""
import uuid

import pytest

from app.database import engine, SessionLocal
from app.models import Proposta, RegraAntifraude


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def nova_proposta():
    def _criar(**overrides):
        defaults = dict(
            proposta_id_externo=f"teste-{uuid.uuid4()}",
            cpf_cliente="11122233344",
            banco="HOPE",
            convenio="INSS",
            valor=5000.0,
        )
        defaults.update(overrides)
        return Proposta(**defaults)
    return _criar


@pytest.fixture
def nova_regra():
    def _criar(**overrides):
        defaults = dict(
            nome="Regra de teste",
            tipo="BLACKLIST",
            parametros={},
            peso_score=100,
            bloqueante=True,
            shadow_mode=False,
            ativo=True,
            prioridade=100,
        )
        defaults.update(overrides)
        return RegraAntifraude(**defaults)
    return _criar
