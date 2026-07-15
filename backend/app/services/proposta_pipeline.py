"""
Núcleo único do processamento de proposta pelo motor antifraude.

Usado tanto pelo shim síncrono de dev (routers/propostas.py::_processar_sync,
sem Celery/Redis) quanto pela task Celery real de produção
(workers/tasks.py::processar_proposta) — extraído para um só lugar para que os
dois caminhos nunca mais divirjam (ver AUDITORIA_PRODUCAO.md, C2).

O chamador é responsável por abrir/fechar a sessão de DB e por decidir o que
fazer em caso de exceção (retry no Celery, propagação simples no dev).
"""

from sqlalchemy.orm import Session

from app.models import Proposta, StatusProposta, TipoEvento, TipoRegra
from app.services.antifraude import MotorAntifraude, ResultadoMotor
from app.services.auditoria import AuditoriaService
from app.services.resolver_corretor import resolver_corretor
from app.services.propostas_dashboard import determinar_origem


def processar_proposta_core(db: Session, proposta_id: str) -> Proposta | None:
    """
    Executa vínculo de corretor (Fase 2), motor antifraude e shadow mode de
    limite (Fase 3) para uma proposta, e grava o status resultante.

    Nunca aprova nem envia ao banco automaticamente: só BLOQUEADO explícito
    bloqueia, qualquer outro resultado do motor cai em ANALISE_MANUAL — decisão
    de crédito exige ação humana (fail-safe, ver C3 em AUDITORIA_PRODUCAO.md).

    Faz commit no final. Retorna None se a proposta não existir.
    """
    proposta = db.query(Proposta).filter(Proposta.id == proposta_id).first()
    if not proposta:
        return None

    audit = AuditoriaService(db)
    proposta.status = StatusProposta.EM_ANALISE
    audit.registrar(proposta_id, TipoEvento.INICIO_ANALISE)

    # Vínculo corretor — só vincula automaticamente em confiança ALTA. Não roda
    # de novo se já tiver corretor_id (evita sobrescrever vínculo manual em
    # reprocessamento). Ver ANALISE_VINCULO_CORRETOR_PROPOSTA.md.
    if not proposta.corretor_id:
        origem = determinar_origem(proposta.proposta_id_externo)
        resolucao = resolver_corretor(db, origem, proposta.payload_original)
        proposta.corretor_resolucao = resolucao.to_dict()
        if resolucao.confianca == "ALTA" and resolucao.corretor_id:
            proposta.corretor_id = resolucao.corretor_id
        audit.registrar(proposta_id, TipoEvento.VINCULO_CORRETOR, dados=proposta.corretor_resolucao)

    decisao = MotorAntifraude(db).avaliar(proposta)
    proposta.score_fraude = decisao.score
    proposta.resultado_motor = decisao.resultado
    proposta.decisao_detalhes = {
        "resultado": decisao.resultado,
        "score": decisao.score,
        "motivo_principal": decisao.motivo_principal,
        "flags": decisao.flags,
        "regras_disparadas": decisao.regras_disparadas,
    }
    audit.registrar(proposta_id, TipoEvento.DECISAO_MOTOR, dados=proposta.decisao_detalhes)

    # Espelha o disparo da regra LIMITE_CORRETOR_SHADOW (se houver) no campo
    # dedicado, para compatibilidade com o dashboard/UI que já lê
    # Proposta.limite_corretor_shadow — nunca influencia resultado_motor/
    # status, só é exibida no debug/dashboard.
    regra_esteira = next(
        (r for r in decisao.regras_disparadas if r["tipo"] == TipoRegra.LIMITE_CORRETOR_SHADOW),
        None,
    )
    if regra_esteira:
        proposta.limite_corretor_shadow = {
            "regra": "LIMITE_CORRETOR_SHADOW",
            "regra_id": regra_esteira["regra_id"],
            "esteira": regra_esteira["detalhes"].get("esteira"),
            "esteira_id": regra_esteira["detalhes"].get("esteira_id"),
            "limite": regra_esteira["detalhes"].get("limite"),
            "valor_proposta": regra_esteira["detalhes"].get("valor_proposta"),
            "status": regra_esteira["detalhes"].get("status"),
            "efeito": "SHADOW",
        }
    else:
        proposta.limite_corretor_shadow = None

    if decisao.resultado == ResultadoMotor.BLOQUEADO:
        proposta.status = StatusProposta.BLOQUEADA
    else:
        proposta.status = StatusProposta.ANALISE_MANUAL

    db.commit()
    return proposta
