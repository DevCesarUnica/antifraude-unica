"""
Agendador interno (APScheduler) — roda dentro do próprio processo FastAPI.

Reúne as tarefas periódicas do sistema sem depender de Celery Beat/worker
externo (que hoje não roda como serviço separado neste projeto — ver
AUDITORIA_PRODUCAO.md, achados A9): sync com a Titan e o robô de varredura
que resgata propostas travadas.

O backend deste projeto não fica no ar 24h (só roda enquanto alguém está
trabalhando nele), então um cron fixo de meia-noite sozinho não seria
suficiente para o sync — o processo estaria desligado nesse horário. Por
isso o sync roda assim que o processo sobe, se repete a cada 2h enquanto
ativo, e também tem um cron de meia-noite para quando rodar 24h num
servidor.

A varredura de propostas travadas (SLA de minutos, não de horas) só faz
sentido como intervalo curto — roda a cada 5 min enquanto o processo
estiver ativo, igual ao beat_schedule original em workers/celery_app.py,
mas chamando processar_proposta_core() direto (síncrono, mesmo núcleo
usado pelo shim de dev e pela task Celery) em vez de enfileirar via
Celery/Redis — não há garantia de que exista um worker consumindo essa
fila neste ambiente.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.logging import log

SP_TZ = ZoneInfo("America/Sao_Paulo")
JANELA_RETROATIVA_DIAS = 3  # margem de segurança para operações que chegaram atrasadas
INTERVALO_HORAS = 2  # frequência de re-sync da Titan enquanto o backend está ativo
INTERVALO_VARREDURA_MINUTOS = 5  # frequência do robô de propostas travadas
LIMITE_ENFILEIRADA_MINUTOS = 5  # ENFILEIRADA parada há mais que isso é reprocessada
LIMITE_ANALISE_MINUTOS = 10     # EM_ANALISE parada há mais que isso vira ERRO

scheduler = AsyncIOScheduler(timezone=SP_TZ)


async def _sync_titan_diario() -> None:
    from app.services.titan_sync import sincronizar

    inicio = (datetime.now(SP_TZ) - timedelta(days=JANELA_RETROATIVA_DIAS)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    try:
        resultado = await sincronizar(
            page_size=100,
            max_pages=200,
            data_inicio=inicio.isoformat(),
        )
        log.info("scheduler.titan_sync_diario_concluido", **resultado)
    except Exception as exc:
        log.error("scheduler.titan_sync_diario_erro", error=str(exc))


def _varredura_propostas_pendentes() -> None:
    """
    Resgata propostas travadas por queda de processo no meio do trabalho:
      1. Reprocessa ENFILEIRADA presas há mais de 5 min.
      2. Marca EM_ANALISE presas há mais de 10 min como ERRO.
    Equivalente a propostas.robo.varredura (workers/tasks.py), mas roda
    aqui porque aquela task só dispara via Celery Beat, que não está
    configurado como serviço neste projeto.
    """
    from app.database import SessionLocal
    from app.models import Proposta, StatusProposta, TipoEvento
    from app.services.auditoria import AuditoriaService
    from app.services.proposta_pipeline import processar_proposta_core

    db = SessionLocal()
    try:
        agora = datetime.now(timezone.utc)
        limite_enfileirada = agora - timedelta(minutes=LIMITE_ENFILEIRADA_MINUTOS)
        limite_analise = agora - timedelta(minutes=LIMITE_ANALISE_MINUTOS)

        travadas = db.query(Proposta).filter(
            Proposta.status == StatusProposta.ENFILEIRADA,
            Proposta.atualizado_em < limite_enfileirada,
        ).all()
        for p in travadas:
            log.warning("scheduler.reprocessando_enfileirada", proposta_id=p.id, atualizado_em=p.atualizado_em.isoformat())
            processar_proposta_core(db, p.id)

        analise_travada = db.query(Proposta).filter(
            Proposta.status == StatusProposta.EM_ANALISE,
            Proposta.atualizado_em < limite_analise,
        ).all()
        for p in analise_travada:
            log.error("scheduler.analise_travada", proposta_id=p.id)
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
            "scheduler.varredura_concluida",
            reprocessadas=len(travadas),
            erro_timeout=len(analise_travada),
        )
    except Exception as exc:
        db.rollback()
        log.error("scheduler.varredura_erro", error=str(exc))
    finally:
        db.close()


def iniciar_scheduler() -> None:
    if scheduler.running:
        return

    # 1. Roda logo na subida do processo (poucos segundos depois, pra não
    #    atrasar o startup do FastAPI).
    scheduler.add_job(
        _sync_titan_diario,
        "date",
        run_date=datetime.now(SP_TZ) + timedelta(seconds=10),
        id="titan_sync_startup",
        replace_existing=True,
    )

    # 2. Repete enquanto o backend estiver ativo (dias de trabalho parcial).
    scheduler.add_job(
        _sync_titan_diario,
        IntervalTrigger(hours=INTERVALO_HORAS),
        id="titan_sync_intervalo",
        replace_existing=True,
    )

    # 3. Agendamento diário à meia-noite (efetivo só se o processo ficar
    #    no ar 24h, ex: deploy em servidor).
    scheduler.add_job(
        _sync_titan_diario,
        CronTrigger(hour=0, minute=0),
        id="titan_sync_diario",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 4. Robô de varredura — resgata propostas travadas (equivalente ao
    #    beat_schedule de workers/celery_app.py, que não roda de fato).
    scheduler.add_job(
        _varredura_propostas_pendentes,
        IntervalTrigger(minutes=INTERVALO_VARREDURA_MINUTOS),
        id="varredura_propostas_pendentes",
        replace_existing=True,
    )

    scheduler.start()


def parar_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
