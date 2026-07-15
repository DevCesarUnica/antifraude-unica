"""
Testes do motor antifraude (app/services/antifraude.py) — a peça mais crítica
do sistema. Cobre as regras principais e a invariante que não pode ser
violada: o motor nunca aprova uma proposta automaticamente (ver
ONBOARDING_DESENVOLVEDOR.txt, "REGRA 2").
"""
from app.models import Blacklist, ResultadoMotor, TipoBlacklist
from app.services.antifraude import MotorAntifraude


def test_blacklist_bloqueia_cpf_cadastrado(db_session, nova_proposta, nova_regra):
    db_session.add(Blacklist(tipo=TipoBlacklist.CPF, valor="11122233344", motivo="fraude conhecida", ativo=True))
    db_session.add(nova_regra(tipo="BLACKLIST", parametros={}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(cpf_cliente="11122233344")
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado == ResultadoMotor.BLOQUEADO
    assert "blacklist" in decisao.motivo_principal.lower()


def test_blacklist_nao_dispara_para_cpf_fora_da_lista(db_session, nova_proposta, nova_regra):
    db_session.add(Blacklist(tipo=TipoBlacklist.CPF, valor="11122233344", motivo="fraude conhecida", ativo=True))
    db_session.add(nova_regra(tipo="BLACKLIST", parametros={}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(cpf_cliente="99988877766")
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado != ResultadoMotor.BLOQUEADO


def test_blacklist_inativa_nao_dispara(db_session, nova_proposta, nova_regra):
    db_session.add(Blacklist(tipo=TipoBlacklist.CPF, valor="11122233344", motivo="revertido", ativo=False))
    db_session.add(nova_regra(tipo="BLACKLIST", parametros={}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(cpf_cliente="11122233344")
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado != ResultadoMotor.BLOQUEADO


def test_valor_maximo_bloqueia(db_session, nova_proposta, nova_regra):
    db_session.add(nova_regra(tipo="VALOR_MAXIMO", parametros={"valor_maximo": 1000.0}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(valor=5000.0)
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado == ResultadoMotor.BLOQUEADO


def test_valor_dentro_do_limite_nao_bloqueia(db_session, nova_proposta, nova_regra):
    db_session.add(nova_regra(tipo="VALOR_MAXIMO", parametros={"valor_maximo": 10000.0}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(valor=5000.0)
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado != ResultadoMotor.BLOQUEADO


def test_banco_convenio_bloqueia(db_session, nova_proposta, nova_regra):
    db_session.add(nova_regra(
        tipo="BANCO_CONVENIO",
        parametros={"combinacoes": [{"banco": "HOPE", "convenio": "INSS"}]},
        bloqueante=True,
        peso_score=100,
    ))
    proposta = nova_proposta(banco="HOPE", convenio="INSS")
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado == ResultadoMotor.BLOQUEADO


def test_uf_bloqueada_dispara(db_session, nova_proposta, nova_regra):
    db_session.add(nova_regra(tipo="UF_BLOQUEADA", parametros={"ufs": ["SP", "RJ"]}, bloqueante=True, peso_score=100))
    proposta = nova_proposta(uf_cliente="SP")
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado == ResultadoMotor.BLOQUEADO


def test_shadow_mode_nunca_bloqueia_nem_soma_score(db_session, nova_proposta, nova_regra):
    db_session.add(nova_regra(
        tipo="VALOR_MAXIMO",
        parametros={"valor_maximo": 100.0},
        bloqueante=True,
        peso_score=100,
        shadow_mode=True,
    ))
    proposta = nova_proposta(valor=999999.0)
    db_session.add(proposta)
    db_session.flush()

    decisao = MotorAntifraude(db_session).avaliar(proposta)

    assert decisao.resultado != ResultadoMotor.BLOQUEADO
    assert decisao.score == 0
    assert decisao.regras_disparadas[0]["efeito"] == "SHADOW"


def test_motor_nunca_retorna_aprovado_automaticamente(db_session, nova_proposta):
    """
    Invariante do sistema (ONBOARDING_DESENVOLVEDOR.txt, REGRA 2): o motor só
    pode produzir BLOQUEADO ou MANUAL. Toda aprovação é decisão humana via
    POST /propostas/{id}/aprovar. Testa vários cenários sem nenhuma regra
    cadastrada e com regras que não disparam — em nenhum caso pode sair
    ResultadoMotor.APROVADO.
    """
    cenarios = [
        dict(valor=1.0),
        dict(valor=999999999.0),
        dict(cpf_cliente="00000000000"),
        dict(banco="QUALQUER", convenio=None),
    ]
    for overrides in cenarios:
        proposta = nova_proposta(**overrides)
        db_session.add(proposta)
        db_session.flush()

        decisao = MotorAntifraude(db_session).avaliar(proposta)

        assert decisao.resultado in (ResultadoMotor.BLOQUEADO, ResultadoMotor.MANUAL)
        assert decisao.resultado != ResultadoMotor.APROVADO
