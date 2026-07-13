"""
Agendador interno (APScheduler) — roda dentro do próprio processo FastAPI.

Sincroniza operações do Titan sem depender de Celery Beat/worker externo
(que hoje não roda como serviço separado neste projeto — ver
AUDITORIA_PRODUCAO.md, achado A9).

O backend deste projeto não fica no ar 24h (só roda enquanto alguém está
trabalhando nele), então um cron fixo de meia-noite sozinho não seria
suficiente — o processo estaria desligado nesse horário. Por isso:

  1. Roda uma vez assim que o processo sobe (cobre o caso comum: ligar o
     backend de manhã e já trazer o que entrou desde a última sessão).
  2. Repete a cada 2h enquanto o processo estiver ativo (cobre novas
     operações que chegam ao longo do dia de trabalho).
  3. Mantém também o agendamento diário à meia-noite, para quando este
     backend rodar num servidor sempre ligado (produção).

A sincronização em si é idempotente (app/services/titan_sync.py ignora
operações já importadas via proposta_id_externo), então rodar várias vezes
ao dia é seguro.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.logging import log

SP_TZ = ZoneInfo("America/Sao_Paulo")
JANELA_RETROATIVA_DIAS = 3  # margem de segurança para operações que chegaram atrasadas
INTERVALO_HORAS = 2  # frequência de re-sync enquanto o backend está ativo

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

    scheduler.start()


def parar_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
