"""
Tasks Celery — processamento assíncrono de propostas.

Fluxo de uma proposta:
  1. API recebe → grava ENFILEIRADA → envia task
  2. processar_proposta: motor antifraude avalia
     - BLOQUEADA  → grava status, auditoria, FIM
     - MANUAL     → grava status, auditoria, FIM (analista decide)
     - APROVADA   → task enviar_ao_banco
  3. enviar_ao_banco: chama API do banco
     - Sucesso    → CONFIRMADA_BANCO
     - Falha      → retry até max; depois → DLQ (ERRO)

Dead Letter Queue (DLQ):
  Tarefas que esgotaram retries são roteadas para propostas.dlq
  e o status da proposta vai para ERRO.
"""

import asyncio
from datetime import datetime, timedelta

from celery import shared_task
from celery.utils.log import get_task_logger
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.models import Proposta, StatusProposta, TipoEvento
from app.services.antifraude import MotorAntifraude, ResultadoMotor
from app.services.auditoria import AuditoriaService
from app.core.logging import log

logger = get_task_logger(__name__)


def _get_proposta(db, proposta_id: str) -> Proposta | None:
    return db.query(Proposta).filter(Proposta.id == proposta_id).first()


# ── Task principal ────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name="propostas.processar",
    queue="propostas",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def processar_proposta(self, proposta_id: str):
    """Executa o motor antifraude na proposta e decide o próximo passo."""
    db = SessionLocal()
    try:
        proposta = _get_proposta(db, proposta_id)
        if not proposta:
            log.error("task.proposta_nao_encontrada", proposta_id=proposta_id)
            return

        auditoria = AuditoriaService(db)

        # Marca início da análise
        proposta.status = StatusProposta.EM_ANALISE
        auditoria.registrar(proposta_id, TipoEvento.INICIO_ANALISE)

        # Motor antifraude
        motor = MotorAntifraude(db)
        decisao = motor.avaliar(proposta)

        # Grava resultado
        proposta.score_fraude = decisao.score
        proposta.resultado_motor = decisao.resultado
        proposta.decisao_detalhes = {
            "resultado": decisao.resultado,
            "score": decisao.score,
            "motivo_principal": decisao.motivo_principal,
            "flags": decisao.flags,
            "regras_disparadas": decisao.regras_disparadas,
        }

        auditoria.registrar(
            proposta_id,
            TipoEvento.DECISAO_MOTOR,
            dados=proposta.decisao_detalhes,
        )

        if decisao.resultado == ResultadoMotor.BLOQUEADO:
            proposta.status = StatusProposta.BLOQUEADA

        elif decisao.resultado == ResultadoMotor.MANUAL:
            proposta.status = StatusProposta.ANALISE_MANUAL

        else:  # APROVADO
            proposta.status = StatusProposta.APROVADA
            # Agenda envio ao banco
            enviar_ao_banco.apply_async(args=[proposta_id], queue="propostas")

        db.commit()
        log.info(
            "task.processado",
            proposta_id=proposta_id,
            resultado=decisao.resultado,
            score=decisao.score,
        )

    except SQLAlchemyError as exc:
        db.rollback()
        log.error("task.db_error", proposta_id=proposta_id, error=str(exc))
        raise self.retry(exc=exc)

    except Exception as exc:
        db.rollback()
        log.error("task.erro_inesperado", proposta_id=proposta_id, error=str(exc))
        raise self.retry(exc=exc)

    finally:
        db.close()


# ── Envio ao banco ────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name="propostas.enviar_banco",
    queue="propostas",
    max_retries=3,
    default_retry_delay=120,
    acks_late=True,
)
def enviar_ao_banco(self, proposta_id: str):
    """
    Envia a proposta aprovada ao banco via Titan API.
    Em caso de falha após max_retries, roteia para DLQ.
    """
    db = SessionLocal()
    try:
        proposta = _get_proposta(db, proposta_id)
        if not proposta:
            return

        auditoria = AuditoriaService(db)
        proposta.status = StatusProposta.ENVIADA_BANCO
        proposta.tentativas = (proposta.tentativas or 0) + 1

        auditoria.registrar(proposta_id, TipoEvento.ENVIO_BANCO, dados={
            "tentativa": proposta.tentativas,
        })
        db.commit()

        # Integração com o banco via Titan (executada de forma síncrona)
        resposta = asyncio.run(_chamar_banco(proposta))

        # Sucesso
        proposta = _get_proposta(db, proposta_id)
        proposta.status = StatusProposta.CONFIRMADA_BANCO
        proposta.resposta_banco = resposta
        proposta.id_operacao_banco = resposta.get("id_operacao")

        auditoria.registrar(proposta_id, TipoEvento.RETORNO_BANCO, dados=resposta)
        db.commit()

        log.info("task.banco_confirmado", proposta_id=proposta_id)

    except Exception as exc:
        db.rollback()
        log.error(
            "task.banco_erro",
            proposta_id=proposta_id,
            tentativa=self.request.retries + 1,
            error=str(exc),
        )

        if self.request.retries >= self.max_retries:
            _mover_para_dlq(proposta_id, str(exc))
        else:
            raise self.retry(exc=exc, countdown=120 * (2 ** self.request.retries))

    finally:
        db.close()


# ── DLQ ───────────────────────────────────────────────────────────────────────

@shared_task(
    name="propostas.dlq.processar",
    queue="propostas.dlq",
    ignore_result=False,
)
def processar_dlq(proposta_id: str, motivo: str):
    """Registra a proposta como ERRO após esgotar todas as tentativas."""
    db = SessionLocal()
    try:
        proposta = _get_proposta(db, proposta_id)
        if not proposta:
            return

        proposta.status = StatusProposta.ERRO
        proposta.ultimo_erro = motivo

        auditoria = AuditoriaService(db)
        auditoria.registrar(proposta_id, TipoEvento.ERRO, dados={"motivo": motivo})
        db.commit()

        log.error("task.dlq_processado", proposta_id=proposta_id, motivo=motivo)

    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mover_para_dlq(proposta_id: str, motivo: str):
    """Roteia proposta para a Dead Letter Queue."""
    log.warning("task.movendo_dlq", proposta_id=proposta_id, motivo=motivo)
    processar_dlq.apply_async(
        args=[proposta_id, motivo],
        queue="propostas.dlq",
    )


# ── Robô de varredura periódica ───────────────────────────────────────────────

@shared_task(
    name="propostas.robo.varredura",
    queue="propostas",
    ignore_result=True,
)
def varredura_pendentes():
    """
    Robô que roda a cada 5 minutos (via Celery Beat) e:
      1. Reprocessa propostas ENFILEIRADA presas há mais de 5 minutos.
      2. Registra ERRO em propostas EM_ANALISE travadas há mais de 10 minutos.

    Resolve situações em que o worker caiu durante o processamento.
    """
    db = SessionLocal()
    try:
        agora = datetime.utcnow()
        limite_enfileirada = agora - timedelta(minutes=5)
        limite_analise = agora - timedelta(minutes=10)

        # Propostas presas em ENFILEIRADA
        travadas = db.query(Proposta).filter(
            Proposta.status == StatusProposta.ENFILEIRADA,
            Proposta.atualizado_em < limite_enfileirada,
        ).all()

        for p in travadas:
            log.warning("robo.reprocessando_enfileirada", proposta_id=p.id, atualizado_em=p.atualizado_em.isoformat())
            processar_proposta.apply_async(args=[p.id], queue="propostas")

        # Propostas presas em EM_ANALISE (worker morreu no meio do processamento)
        analise_travada = db.query(Proposta).filter(
            Proposta.status == StatusProposta.EM_ANALISE,
            Proposta.atualizado_em < limite_analise,
        ).all()

        for p in analise_travada:
            log.error("robo.analise_travada", proposta_id=p.id)
            p.status = StatusProposta.ERRO
            p.ultimo_erro = "Processamento travado — reprocesse manualmente"
            AuditoriaService(db).registrar(
                p.id,
                TipoEvento.ERRO,
                dados={"motivo": "timeout_analise", "robo": True},
            )

        if analise_travada:
            db.commit()

        log.info(
            "robo.varredura_concluida",
            reprocessadas=len(travadas),
            erro_timeout=len(analise_travada),
        )

    except Exception as exc:
        db.rollback()
        log.error("robo.varredura_erro", error=str(exc))
    finally:
        db.close()


async def _chamar_banco(proposta: Proposta) -> dict:
    """
    Chamada ao banco via Titan API.
    Estrutura real depende do produto/banco — aqui o schema mínimo.
    """
    import httpx
    from app.core.config import settings

    payload = {
        "proposta_id_externo": proposta.proposta_id_externo,
        "cpf": proposta.cpf_cliente,
        "banco": proposta.banco,
        "convenio": proposta.convenio,
        "produto": proposta.produto,
        "valor": proposta.valor,
        "payload_original": proposta.payload_original or {},
    }

    async with httpx.AsyncClient(
        base_url=settings.titan_base_url,
        headers={"Titan-Api-Key": settings.titan_api_key},
        timeout=30,
    ) as client:
        resp = await client.post("/propostas/enviar", json=payload)
        resp.raise_for_status()
        return resp.json()
