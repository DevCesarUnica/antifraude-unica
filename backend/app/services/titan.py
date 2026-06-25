"""
TitanService — integração com a API Titan da Ceoslab (banco Hope).

Cache em dois níveis:
  1. Redis (quando disponível) — TTL configurável, mais rápido
  2. SQLite TitanCache (fallback) — para dev local sem Redis
"""

import json
import time
import asyncio
from datetime import datetime, timedelta
from typing import Any

import httpx
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

_log = logging.getLogger("titan")

# ── Redis (opcional) ──────────────────────────────────────────────────────────

try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

_redis_client = None
_redis_failed = False


def _get_redis():
    global _redis_client, _redis_failed
    if _redis_failed or not _REDIS_AVAILABLE:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        client = _redis_lib.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        client.ping()
        _redis_client = client
        log.info("titan.redis_conectado", url=settings.redis_url)
        return _redis_client
    except Exception as exc:
        _redis_failed = True
        log.warning("titan.redis_indisponivel", detalhe=str(exc), fallback="SQLite")
        return None


# ── Cache SQLite (fallback) ───────────────────────────────────────────────────

def _sqlite_get(endpoint: str) -> Any | None:
    from app.database import SessionLocal
    from app.models import TitanCache

    db = SessionLocal()
    try:
        row = (
            db.query(TitanCache)
            .filter(
                TitanCache.endpoint == endpoint,
                TitanCache.expira_em > datetime.utcnow(),
            )
            .first()
        )
        if row:
            log.debug("titan.sqlite_cache_hit", endpoint=endpoint)
            return row.dados
        return None
    finally:
        db.close()


def _sqlite_set(endpoint: str, data: Any) -> None:
    from app.database import SessionLocal
    from app.models import TitanCache

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        row = TitanCache(
            endpoint=endpoint,
            dados=data,
            cached_em=now,
            expira_em=now + timedelta(seconds=settings.titan_cache_ttl),
        )
        db.merge(row)
        db.commit()
        log.debug("titan.sqlite_cache_set", endpoint=endpoint, ttl=settings.titan_cache_ttl)
    except Exception as exc:
        db.rollback()
        log.error("titan.sqlite_cache_erro", error=str(exc))
    finally:
        db.close()


def _sqlite_delete(endpoint: str | None) -> None:
    from app.database import SessionLocal
    from app.models import TitanCache

    db = SessionLocal()
    try:
        q = db.query(TitanCache)
        if endpoint:
            q = q.filter(TitanCache.endpoint == endpoint)
        q.delete()
        db.commit()
    finally:
        db.close()


# ── Exceções ──────────────────────────────────────────────────────────────────

class TitanAPIError(Exception):
    pass


class TitanAuthError(TitanAPIError):
    """Credencial inválida (401/403) — não conta como falha de serviço."""
    pass


# ── Serviço principal ─────────────────────────────────────────────────────────

class TitanService:
    """
    Serviço de integração com a API Titan (Hope/Ceoslab).

    Uso:
        async with TitanService() as titan:
            bancos = await titan.get_banks()
    """

    BASE_URL = settings.titan_base_url
    HEADERS = {
        "Titan-Api-Key": settings.titan_api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
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

    # ── Normalização ──────────────────────────────────────────────────────────

    @staticmethod
    def _n_banco(b: dict) -> dict:
        return {
            "id":     b.get("id"),
            "codigo": b.get("code") or b.get("codigo"),
            "nome":   b.get("name") or b.get("nome"),
        }

    @staticmethod
    def _n_produto(p: dict) -> dict:
        return {
            "id":           p.get("id"),
            "codigo":       p.get("code") or p.get("codigo"),
            "nome":         p.get("name") or p.get("nome"),
            "tipo_produto": p.get("productType") or p.get("tipo_produto") or p.get("tipo"),
        }

    @staticmethod
    def _n_item(item: dict) -> dict:
        return {
            "id":     item.get("id"),
            "codigo": item.get("code") or item.get("codigo"),
            "nome":   item.get("name") or item.get("nome"),
        }

    # ── Fetch com retry + circuit breaker ─────────────────────────────────────

    @retry(
        stop=stop_after_attempt(settings.titan_max_retries),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        before_sleep=before_sleep_log(_log, logging.WARNING),
        reraise=True,
    )
    async def _fetch(self, endpoint: str) -> Any:
        async def _call():
            t0 = time.monotonic()
            log.info("titan.request", endpoint=endpoint)
            resp = await self._client.get(endpoint)
            latencia_ms = round((time.monotonic() - t0) * 1000, 1)
            log.info(
                "titan.response",
                endpoint=endpoint,
                status=resp.status_code,
                latencia_ms=latencia_ms,
            )
            if resp.status_code in (401, 403):
                raise TitanAuthError(
                    f"Titan API: credencial inválida (HTTP {resp.status_code})"
                )
            resp.raise_for_status()
            return resp.json()

        try:
            # TitanAuthError não conta como falha de serviço no circuit breaker
            return await self._breaker.chamar_async(
                _call, ignorar_excecoes=(TitanAuthError,)
            )
        except (TitanAPIError, TitanAuthError):
            raise
        except CircuitBreakerAberto as exc:
            log.error("titan.circuit_breaker_open", endpoint=endpoint, error=str(exc))
            raise TitanAPIError(f"Titan API indisponível: {exc}") from exc

    # ── Cache (Redis → SQLite fallback) ───────────────────────────────────────

    def _cache_key(self, endpoint: str) -> str:
        return f"titan:{endpoint.strip('/')}"

    async def _get_cached(self, endpoint: str) -> Any | None:
        redis = _get_redis()
        if redis is not None:
            raw = redis.get(self._cache_key(endpoint))
            if raw:
                log.debug("titan.redis_cache_hit", endpoint=endpoint)
                return json.loads(raw)
            return None
        return _sqlite_get(endpoint)

    async def _set_cache(self, endpoint: str, data: Any) -> None:
        redis = _get_redis()
        if redis is not None:
            redis.setex(
                self._cache_key(endpoint),
                settings.titan_cache_ttl,
                json.dumps(data, ensure_ascii=False),
            )
            log.debug("titan.redis_cache_set", endpoint=endpoint)
        else:
            _sqlite_set(endpoint, data)

    async def _set_cache_ttl(self, endpoint: str, data: Any, ttl: int) -> None:
        redis = _get_redis()
        if redis is not None:
            redis.setex(
                self._cache_key(endpoint),
                ttl,
                json.dumps(data, ensure_ascii=False),
            )
        else:
            from app.database import SessionLocal
            from app.models import TitanCache
            now = datetime.utcnow()
            db = SessionLocal()
            try:
                row = TitanCache(
                    endpoint=endpoint,
                    dados=data,
                    cached_em=now,
                    expira_em=now + timedelta(seconds=ttl),
                )
                db.merge(row)
                db.commit()
            except Exception as exc:
                db.rollback()
                log.error("titan.sqlite_cache_erro", error=str(exc))
            finally:
                db.close()

    def _get_mock(self, endpoint: str) -> Any | None:
        from app.services import titan_mock as _mock
        _exact = {
            "/banks":                        _mock.BANKS,
            "/sexes":                        _mock.SEXES,
            "/civil-statueses":              _mock.CIVIL_STATUSES,
            "/professions":                  _mock.PROFESSIONS,
            "/daycoval/operations/products": _mock.DAYCOVAL_PRODUCTS,
        }
        if endpoint in _exact:
            return _exact[endpoint]

        # Padrão: /{banco_id}/operations/products
        parts = endpoint.strip("/").split("/")
        if len(parts) >= 3 and parts[-1] == "products" and parts[-2] == "operations":
            banco_id = parts[0]
            try:
                return _mock.PRODUTOS_POR_BANCO.get(int(banco_id)) or _mock.PRODUTOS_GENERICOS
            except ValueError:
                return _mock.PRODUTOS_POR_BANCO.get(banco_id) or _mock.PRODUTOS_GENERICOS

        return None

    async def _get(self, endpoint: str, force_refresh: bool = False) -> Any:
        if not force_refresh:
            cached = await self._get_cached(endpoint)
            if cached is not None:
                return cached

        try:
            data = await self._fetch(endpoint)
        except TitanAPIError as exc:
            mock_data = self._get_mock(endpoint)
            if mock_data is not None:
                log.warning("titan.usando_mock", endpoint=endpoint, motivo=str(exc))
                await self._set_cache_ttl(endpoint, mock_data, ttl=300)
                return mock_data
            raise

        await self._set_cache(endpoint, data)
        log.info(
            "titan.fetched",
            endpoint=endpoint,
            count=len(data) if isinstance(data, list) else 1,
        )
        return data

    # ── POST (sem retry — evita duplicação de operação) ──────────────────────

    async def _post(self, endpoint: str, payload: dict) -> Any:
        async def _call():
            t0 = time.monotonic()
            log.info("titan.post_request", endpoint=endpoint)
            resp = await self._client.post(endpoint, json=payload)
            latencia_ms = round((time.monotonic() - t0) * 1000, 1)
            log.info(
                "titan.post_response",
                endpoint=endpoint,
                status=resp.status_code,
                latencia_ms=latencia_ms,
            )
            if resp.status_code in (401, 403):
                raise TitanAuthError(
                    f"Titan API: credencial inválida (HTTP {resp.status_code})"
                )
            resp.raise_for_status()
            return resp.json()

        try:
            return await self._breaker.chamar_async(
                _call, ignorar_excecoes=(TitanAuthError,)
            )
        except (TitanAPIError, TitanAuthError):
            raise
        except CircuitBreakerAberto as exc:
            log.error("titan.circuit_breaker_open", endpoint=endpoint, error=str(exc))
            raise TitanAPIError(f"Titan API indisponível: {exc}") from exc

    # ── Endpoints públicos ─────────────────────────────────────────────────────

    async def get_banks(self, force_refresh: bool = False) -> list[dict]:
        data = await self._get("/banks", force_refresh)
        return [self._n_banco(b) for b in (data if isinstance(data, list) else [])]

    async def get_sexes(self, force_refresh: bool = False) -> list[dict]:
        data = await self._get("/sexes", force_refresh)
        return [self._n_item(s) for s in (data if isinstance(data, list) else [])]

    async def get_civil_statuses(self, force_refresh: bool = False) -> list[dict]:
        data = await self._get("/civil-statueses", force_refresh)
        return [self._n_item(s) for s in (data if isinstance(data, list) else [])]

    async def get_professions(self, force_refresh: bool = False) -> list[dict]:
        data = await self._get("/professions", force_refresh)
        return [self._n_item(p) for p in (data if isinstance(data, list) else [])]

    async def get_daycoval_products(self, force_refresh: bool = False) -> list[dict]:
        data = await self._get("/daycoval/operations/products", force_refresh)
        return [self._n_produto(p) for p in (data if isinstance(data, list) else [])]

    async def get_produtos_banco(
        self, banco_id: str | int, force_refresh: bool = False
    ) -> list[dict]:
        endpoint = f"/{banco_id}/operations/products"
        data = await self._get(endpoint, force_refresh)
        return [self._n_produto(p) for p in (data if isinstance(data, list) else [])]

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
        output: dict[str, Any] = {}
        for key, result in zip(keys, results):
            if isinstance(result, Exception):
                log.error("titan.partial_failure", endpoint=key, error=str(result))
                output[key] = []
            else:
                output[key] = result
        return output

    async def create_operation(self, payload: dict) -> dict:
        """Cria uma operação no motor de cálculo externo Titan."""
        data = await self._post("/operations/create", payload)
        log.info("titan.operation_created", operation_id=data.get("id"))
        return data

    async def get_operation(self, operation_id: str | int) -> dict:
        """Consulta uma operação existente pelo ID (sem cache — dado muda de estado)."""
        return await self._fetch(f"/operations/{operation_id}")

    # ── Invalidar cache ────────────────────────────────────────────────────────

    async def invalidar_cache(self, endpoint: str | None = None) -> None:
        redis = _get_redis()
        if redis is not None:
            if endpoint:
                redis.delete(self._cache_key(endpoint))
            else:
                for key in redis.scan_iter("titan:*"):
                    redis.delete(key)
        else:
            _sqlite_delete(endpoint)
        log.info("titan.cache_invalidated", endpoint=endpoint or "all")

    async def get_referencia_banco(
        self, banco_id: str | int, force_refresh: bool = False
    ) -> dict:
        """Tabelas de referência para preenchimento de proposta de um banco específico."""
        resultados = await asyncio.gather(
            self.get_produtos_banco(banco_id, force_refresh),
            self.get_sexes(force_refresh),
            self.get_civil_statuses(force_refresh),
            self.get_professions(force_refresh),
            return_exceptions=True,
        )
        keys = ["produtos", "sexos", "estados_civis", "profissoes"]
        output: dict[str, Any] = {}
        for key, result in zip(keys, resultados):
            if isinstance(result, Exception):
                log.error(
                    "titan.referencia_banco_partial_failure",
                    campo=key,
                    banco_id=banco_id,
                    error=str(result),
                )
                output[key] = []
            else:
                output[key] = result
        return output

    # ── Status ─────────────────────────────────────────────────────────────────

    def status(self) -> dict:
        redis = _get_redis()
        api_key_ok = settings.titan_api_key not in ("123", "", "sua-chave-aqui")
        return {
            "circuit_breaker": repr(self._breaker),
            "estado":              self._breaker.estado,
            "cache_backend":       "redis" if redis is not None else "sqlite",
            "api_key_configurada": api_key_ok,
            "modo":                "real" if api_key_ok else "mock",
        }

    async def status_async(self) -> dict:
        """Retorna status completo incluindo ping real à API Titan com medição de latência."""
        redis = _get_redis()
        api_key_ok = settings.titan_api_key not in ("123", "", "sua-chave-aqui")
        estado_atual = str(self._breaker.estado)

        resultado: dict[str, Any] = {
            "circuit_breaker":     repr(self._breaker),
            "estado":              self._breaker.estado,
            "cache_backend":       "redis" if redis is not None else "sqlite",
            "api_key_configurada": api_key_ok,
            "modo":                "real" if api_key_ok else "mock",
            "conectividade":       None,
            "latencia_ms":         None,
            "http_status":         None,
            "erro":                None,
        }

        if not api_key_ok:
            resultado["conectividade"] = "sem_chave_api"
        elif estado_atual == "OPEN":
            resultado["conectividade"] = "circuit_breaker_open"
        else:
            try:
                t0 = time.monotonic()
                resp = await self._client.get(
                    "/operations?page=1&pageSize=1", timeout=httpx.Timeout(5.0)
                )
                latencia_ms = round((time.monotonic() - t0) * 1000, 1)
                resultado["conectividade"] = "ok" if resp.status_code < 400 else "degradado"
                resultado["latencia_ms"]   = latencia_ms
                resultado["http_status"]   = resp.status_code
                log.info(
                    "titan.status_ping",
                    latencia_ms=latencia_ms,
                    http_status=resp.status_code,
                )
            except Exception as exc:
                resultado["conectividade"] = "erro"
                resultado["erro"]          = str(exc)
                log.warning("titan.status_ping_erro", error=str(exc))

        return resultado
