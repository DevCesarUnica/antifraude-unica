"""
TitanService — integração com a API Titan da Ceoslab.

Responsabilidades:
  - Buscar e cachear dados de referência (bancos, sexos, estados civis, etc.)
  - Circuit breaker para proteger contra indisponibilidade
  - Retry com backoff exponencial
  - Cache em Redis (TTL configurável)
"""

import json
import asyncio
from typing import Any

import httpx
import redis
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from app.core.config import settings
from app.core.circuit_breaker import get_breaker, CircuitBreakerAberto
from app.core.logging import log

import logging

# Cliente Redis síncrono (usado nos workers Celery)
_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


class TitanAPIError(Exception):
    pass


class TitanService:
    """
    Serviço de integração com a API Titan.

    Uso:
        async with TitanService() as titan:
            bancos = await titan.get_banks()
    """

    BASE_URL = settings.titan_base_url
    HEADERS = {
        "Titan-Api-Key": settings.titan_api_key,
        "Content-Type": "application/json",
    }

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._breaker = get_breaker("titan_api")

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers=self.HEADERS,
            timeout=settings.titan_timeout,
        )
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    # ── Fetch com retry + circuit breaker ────────────────────────────────────

    @retry(
        stop=stop_after_attempt(settings.titan_max_retries),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        before_sleep=before_sleep_log(logging.getLogger("titan"), logging.WARNING),
        reraise=True,
    )
    async def _fetch(self, endpoint: str) -> Any:
        """Chamada HTTP com retry automático e circuit breaker."""
        async def _call():
            log.info("titan.request", endpoint=endpoint)
            resp = await self._client.get(endpoint)
            resp.raise_for_status()
            return resp.json()

        try:
            return await self._breaker.chamar_async(_call)
        except CircuitBreakerAberto as exc:
            log.error("titan.circuit_breaker_open", endpoint=endpoint, error=str(exc))
            raise TitanAPIError(f"Titan API indisponível: {exc}") from exc

    # ── Cache Redis ───────────────────────────────────────────────────────────

    def _cache_key(self, endpoint: str) -> str:
        return f"titan:{endpoint.strip('/')}"

    async def _get_cached(self, endpoint: str) -> Any | None:
        redis_client = _get_redis()
        raw = redis_client.get(self._cache_key(endpoint))
        if raw:
            log.debug("titan.cache_hit", endpoint=endpoint)
            return json.loads(raw)
        return None

    async def _set_cache(self, endpoint: str, data: Any):
        redis_client = _get_redis()
        redis_client.setex(
            self._cache_key(endpoint),
            settings.titan_cache_ttl,
            json.dumps(data, ensure_ascii=False),
        )
        log.debug("titan.cache_set", endpoint=endpoint, ttl=settings.titan_cache_ttl)

    async def _get(self, endpoint: str, force_refresh: bool = False) -> Any:
        """Busca com cache: Redis primeiro, API se não encontrar."""
        if not force_refresh:
            cached = await self._get_cached(endpoint)
            if cached is not None:
                return cached

        data = await self._fetch(endpoint)
        await self._set_cache(endpoint, data)
        log.info("titan.fetched", endpoint=endpoint, count=len(data) if isinstance(data, list) else 1)
        return data

    # ── Endpoints públicos ────────────────────────────────────────────────────

    async def get_banks(self, force_refresh: bool = False) -> list[dict]:
        """Lista de bancos disponíveis."""
        return await self._get("/banks", force_refresh)

    async def get_sexes(self, force_refresh: bool = False) -> list[dict]:
        """Tipos de sexo (para cadastro de clientes)."""
        return await self._get("/sexes", force_refresh)

    async def get_civil_statuses(self, force_refresh: bool = False) -> list[dict]:
        """Estados civis."""
        return await self._get("/civil-statueses", force_refresh)

    async def get_professions(self, force_refresh: bool = False) -> list[dict]:
        """Profissões."""
        return await self._get("/professions", force_refresh)

    async def get_daycoval_products(self, force_refresh: bool = False) -> list[dict]:
        """Produtos financeiros Daycoval."""
        return await self._get("/daycoval/operations/products", force_refresh)

    async def get_all(self, force_refresh: bool = False) -> dict:
        """Busca todos os dados de referência em paralelo."""
        results = await asyncio.gather(
            self.get_banks(force_refresh),
            self.get_sexes(force_refresh),
            self.get_civil_statuses(force_refresh),
            self.get_professions(force_refresh),
            self.get_daycoval_products(force_refresh),
            return_exceptions=True,
        )
        keys = ["banks", "sexes", "civil_statuses", "professions", "daycoval_products"]
        output = {}
        for key, result in zip(keys, results):
            if isinstance(result, Exception):
                log.error("titan.partial_failure", endpoint=key, error=str(result))
                output[key] = []
            else:
                output[key] = result
        return output

    # ── Invalidar cache ───────────────────────────────────────────────────────

    async def invalidar_cache(self, endpoint: str | None = None):
        redis_client = _get_redis()
        if endpoint:
            redis_client.delete(self._cache_key(endpoint))
        else:
            for key in redis_client.scan_iter("titan:*"):
                redis_client.delete(key)
        log.info("titan.cache_invalidated", endpoint=endpoint or "all")

    # ── Status do serviço ─────────────────────────────────────────────────────

    def status(self) -> dict:
        return {
            "circuit_breaker": repr(self._breaker),
            "estado": self._breaker.estado,
        }
