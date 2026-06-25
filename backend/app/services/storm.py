"""
StormService — integração com a API Storm Tecnologia (openapi.stormfin.com.br).

Autenticação: OAuth2 Resource Owner Password Grant.
  POST /token  →  grant_type=password + client_id + username + password
  Token renovado automaticamente quando expira ou ao receber 401.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.circuit_breaker import CircuitBreakerAberto, get_breaker
from app.core.config import settings
from app.core.logging import log

_log = logging.getLogger("storm")


# ── Exceções ──────────────────────────────────────────────────────────────────

class StormAPIError(Exception):
    """Erro genérico retornado pela API Storm."""


class StormAuthError(StormAPIError):
    """Falha de autenticação (credenciais ou client_id inválidos)."""


class StormPermissionError(StormAPIError):
    """Usuário autenticado mas sem permissão no recurso solicitado (HTTP 403)."""


class StormRateLimitError(StormAPIError):
    """Limite de requisições atingido (20 req/min)."""


# ── Cache de token (módulo-level, compartilhado entre instâncias) ─────────────

@dataclass
class _TokenCache:
    access_token: str | None = None
    expira_em: datetime | None = None

    def valido(self) -> bool:
        if self.access_token is None or self.expira_em is None:
            return False
        # Margem de 2 minutos para evitar uso de token próximo ao vencimento
        return datetime.now(tz=timezone.utc) < self.expira_em - timedelta(minutes=2)

    def invalidar(self) -> None:
        self.access_token = None
        self.expira_em = None

    def salvar(self, access_token: str, expires_in: int) -> None:
        self.access_token = access_token
        self.expira_em = datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)


_token_cache = _TokenCache()
_token_lock = asyncio.Lock()


# ── Serviço ───────────────────────────────────────────────────────────────────

class StormService:
    """
    Cliente assíncrono para a API Storm Tecnologia.

    Uso:
        async with StormService() as storm:
            contratos = await storm.get_antifraude_contratos("antifraude")

    Características:
      - Autenticação OAuth2 com client_id (prestador de serviços)
      - Renovação automática de token com double-checked locking
      - Retry exponencial via tenacity (somente em erros de rede/timeout)
      - Circuit breaker para evitar cascata de falhas
      - Logs estruturados por evento
    """

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._breaker = get_breaker("storm_api")

    async def __aenter__(self) -> "StormService":
        self._client = httpx.AsyncClient(
            base_url=settings.storm_base_url,
            timeout=httpx.Timeout(settings.storm_timeout),
            headers={"Accept": "application/json"},
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    # ── Autenticação ──────────────────────────────────────────────────────────

    async def _obter_token(self) -> str:
        """Retorna o token vigente, renovando-o se necessário (thread-safe)."""
        # Fast path — sem lock
        if _token_cache.valido():
            return _token_cache.access_token  # type: ignore[return-value]

        # Slow path — só uma coroutine renova por vez
        async with _token_lock:
            if _token_cache.valido():  # re-check após adquirir o lock
                return _token_cache.access_token  # type: ignore[return-value]

            await self._renovar_token()
            return _token_cache.access_token  # type: ignore[return-value]

    async def _renovar_token(self) -> None:
        """Executa o OAuth2 Password Grant e atualiza o cache."""
        self._verificar_credenciais()

        log.info("storm.autenticando", username=settings.storm_username)

        payload: dict[str, str] = {
            "grant_type": "password",
            "client_id": settings.storm_client_id,
            "username": settings.storm_username,
            "password": settings.storm_password,
        }
        if settings.storm_client_secret:
            payload["client_secret"] = settings.storm_client_secret

        resp = await self._client.post("/token", data=payload)  # type: ignore[union-attr]

        if resp.status_code in (400, 401, 403):
            detalhe = self._extrair_detalhe(resp)
            raise StormAuthError(
                f"Storm API: autenticação recusada (HTTP {resp.status_code}) — {detalhe}"
            )

        resp.raise_for_status()
        data = resp.json()

        _token_cache.salvar(
            access_token=data["access_token"],
            expires_in=int(data.get("expires_in", 3600)),
        )
        log.info(
            "storm.token_renovado",
            expira_em=_token_cache.expira_em.isoformat() if _token_cache.expira_em else None,
        )

    def _verificar_credenciais(self) -> None:
        faltas = [
            campo
            for campo, valor in [
                ("STORM_USERNAME", settings.storm_username),
                ("STORM_PASSWORD", settings.storm_password),
                ("STORM_CLIENT_ID", settings.storm_client_id),
            ]
            if not valor
        ]
        if faltas:
            raise StormAuthError(
                f"Storm API: variáveis de ambiente não configuradas: {', '.join(faltas)}"
            )

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def _extrair_detalhe(resp: httpx.Response) -> str:
        try:
            body = resp.json()
            return body.get("detail") or body.get("error_description") or body.get("message") or str(body)
        except Exception:
            return resp.text[:200]

    async def _chamar_com_retry_get(self, path: str, params: dict | None = None) -> Any:
        """GET com retry exponencial e circuit breaker."""

        @retry(
            stop=stop_after_attempt(settings.storm_max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
            before_sleep=before_sleep_log(_log, logging.WARNING),
            reraise=True,
        )
        async def _tentativa() -> Any:
            token = await self._obter_token()
            log.debug("storm.get", path=path, params=params)
            resp = await self._client.get(path, params=params, headers=self._auth_headers(token))  # type: ignore[union-attr]
            return self._processar_resposta(resp, path)

        async def _call() -> Any:
            return await _tentativa()

        try:
            return await self._breaker.chamar_async(_call, ignorar_excecoes=(StormAuthError, StormPermissionError))
        except (StormAuthError, StormPermissionError, StormAPIError):
            raise
        except CircuitBreakerAberto as exc:
            raise StormAPIError(f"Storm API indisponível (circuit breaker aberto): {exc}") from exc

    async def _chamar_com_retry_post(
        self, path: str, body: dict | None = None, params: dict | None = None
    ) -> Any:
        """POST com retry exponencial e circuit breaker."""

        @retry(
            stop=stop_after_attempt(settings.storm_max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
            before_sleep=before_sleep_log(_log, logging.WARNING),
            reraise=True,
        )
        async def _tentativa() -> Any:
            token = await self._obter_token()
            log.debug("storm.post", path=path)
            resp = await self._client.post(  # type: ignore[union-attr]
                path, json=body, params=params, headers=self._auth_headers(token)
            )
            return self._processar_resposta(resp, path)

        async def _call() -> Any:
            return await _tentativa()

        try:
            return await self._breaker.chamar_async(_call, ignorar_excecoes=(StormAuthError, StormPermissionError))
        except (StormAuthError, StormPermissionError, StormAPIError):
            raise
        except CircuitBreakerAberto as exc:
            raise StormAPIError(f"Storm API indisponível (circuit breaker aberto): {exc}") from exc

    def _processar_resposta(self, resp: httpx.Response, path: str) -> Any:
        if resp.status_code == 401:
            # Token expirado ou inválido — invalida cache para forçar renovação
            _token_cache.invalidar()
            raise StormAuthError(
                f"Storm API: token rejeitado em {path!r} — credenciais podem ter mudado"
            )
        if resp.status_code == 403:
            # Autenticado mas sem permissão — NÃO invalida o token
            detalhe = self._extrair_detalhe(resp)
            raise StormPermissionError(
                f"Storm API: sem permissão para {path!r}. "
                f"Verifique se o usuário possui acesso a este endpoint na Storm. "
                f"Detalhe: {detalhe}"
            )
        if resp.status_code == 429:
            raise StormRateLimitError("Storm API: limite de 20 req/min atingido")
        if resp.status_code == 422:
            raise StormAPIError(
                f"Storm API: requisição inválida em {path!r} — {self._extrair_detalhe(resp)}"
            )
        resp.raise_for_status()
        return resp.json()

    # ── Status ────────────────────────────────────────────────────────────────

    def status(self) -> dict:
        return {
            "circuit_breaker": repr(self._breaker),
            "estado": self._breaker.estado,
            "credenciais_configuradas": all([
                settings.storm_username,
                settings.storm_password,
                settings.storm_client_id,
            ]),
            "token_ativo": _token_cache.valido(),
            "token_expira_em": _token_cache.expira_em.isoformat() if _token_cache.expira_em else None,
        }

    # ── Antifraude ────────────────────────────────────────────────────────────

    async def get_antifraude_contratos(self, esteira: str, pagina: int = 1) -> Any:
        return await self._chamar_com_retry_get(
            "/antifraude/listar_contratos", {"esteira": esteira, "pagina": pagina}
        )

    async def get_tipos_recusas(self) -> Any:
        return await self._chamar_com_retry_get("/antifraude/tipos_recusas")

    async def get_tipos_pendencias(self) -> Any:
        return await self._chamar_com_retry_get("/antifraude/tipos_pendencias")

    async def aprovar_contrato(self, contrato_id: int) -> Any:
        return await self._chamar_com_retry_post(f"/antifraude/{contrato_id}/aprovar")

    async def recusar_contrato(self, contrato_id: int, motivo: dict) -> Any:
        return await self._chamar_com_retry_post(f"/antifraude/{contrato_id}/recusar", body=motivo)

    async def pendenciar_contrato(self, contrato_id: int, motivo: dict) -> Any:
        return await self._chamar_com_retry_post(f"/antifraude/{contrato_id}/pendenciar", body=motivo)

    async def reanalisar_contrato(self, contrato_id: int, observacao: dict) -> Any:
        return await self._chamar_com_retry_post(f"/antifraude/{contrato_id}/reanalisar", body=observacao)

    # ── Contratos ─────────────────────────────────────────────────────────────

    async def get_contratos(
        self,
        pagina: int = 1,
        cpf: str | None = None,
        ff: str | None = None,
        id_banco: int | None = None,
        id_status: int | None = None,
        data_inicio: str | None = None,
        data_fim: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {"pagina": pagina}
        if cpf:
            digits = "".join(c for c in cpf if c.isdigit())
            if len(digits) == 11:
                cpf = f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
            params["cpf_cliente"] = cpf
        if ff:
            params["ff"] = ff
        if id_banco is not None:
            params["id_banco"] = id_banco
        if id_status is not None:
            params["id_status"] = id_status
        if data_inicio:
            params["data_inicio"] = data_inicio
        if data_fim:
            params["data_fim"] = data_fim
        return await self._chamar_com_retry_get("/contratos", params)

    async def get_historico_contrato(self, ff: str) -> Any:
        return await self._chamar_com_retry_get("/historico_contrato", {"contrato_ff": ff})

    async def get_acompanhamento_contrato(self, ff: str) -> Any:
        return await self._chamar_com_retry_get("/historico_contrato", {"contrato_ff": ff})

    async def get_status_contrato(self) -> Any:
        return await self._chamar_com_retry_get("/contratos_status")

    # ── Clientes ──────────────────────────────────────────────────────────────

    async def get_cliente_por_cpf(self, cpf: str) -> Any:
        digits = "".join(c for c in cpf if c.isdigit())
        if len(digits) == 11:
            cpf = f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
        return await self._chamar_com_retry_get("/buscar_resumo_cliente_por_cpf", {"cpf": cpf})

    async def get_cliente_por_telefone(self, telefone: str) -> Any:
        return await self._chamar_com_retry_get("/buscar_resumo_cliente_por_telefone", {"telefone": telefone})

    # ── Colaboradores ─────────────────────────────────────────────────────────

    async def get_colaboradores(
        self,
        pagina: int = 1,
        usuario: str | None = None,
        status_usuario: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {"pagina": pagina}
        if usuario:
            params["usuario"] = usuario
        if status_usuario:
            params["status_usuario"] = status_usuario
        return await self._chamar_com_retry_get("/colaboradores", params)

    async def get_colaborador(self, colaborador_id: int) -> Any:
        return await self._chamar_com_retry_get(f"/colaboradores/{colaborador_id}")

    # ── Simulações ────────────────────────────────────────────────────────────

    async def simular_clt(
        self,
        cpf: str,
        banco_id: int,
        valor_solicitado: float | None = None,
        matricula: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {"cpf": cpf, "banco_id": banco_id}
        if valor_solicitado is not None:
            params["valor_solicitado"] = valor_solicitado
        if matricula:
            params["matricula"] = matricula
        return await self._chamar_com_retry_get("/simular_clt", params)

    async def simular_fgts(self, cpf: str, banco_id: int) -> Any:
        return await self._chamar_com_retry_get("/simular_fgts", {"cpf": cpf, "banco_id": banco_id})

    # ── Referência ────────────────────────────────────────────────────────────

    async def get_bancos(self) -> Any:
        return await self._chamar_com_retry_get("/bancos")

    async def get_orgaos(self) -> Any:
        return await self._chamar_com_retry_get("/orgaos")
