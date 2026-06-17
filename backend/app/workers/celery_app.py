"""
Configuração do Celery — filas de processamento assíncrono.

Filas:
  propostas        → processamento normal
  propostas.dlq    → Dead Letter Queue (falhas após max_retries)
"""

from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "antifraude",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    # Serialização
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,

    # Filas
    task_queues={
        "propostas": {"exchange": "propostas", "routing_key": "propostas"},
        "propostas.dlq": {"exchange": "propostas.dlq", "routing_key": "propostas.dlq"},
    },
    task_default_queue="propostas",

    # Comportamento
    task_acks_late=True,           # ACK só após conclusão (segurança em crash)
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # 1 tarefa por worker (evita monopolização)

    # Retry
    task_max_retries=3,
    task_default_retry_delay=60,   # segundos

    # Resultados expiram em 24h
    result_expires=86400,
)

celery_app.autodiscover_tasks(["app.workers"])
