"""
Circuit Breaker — padrão de resiliência para chamadas externas.

Estados:
  CLOSED    → funcionando normalmente, todas as chamadas passam
  OPEN      → muitas falhas, todas as chamadas são rejeitadas imediatamente
  HALF_OPEN → testando recuperação, uma chamada passa para verificar
"""

import threading
import time
from enum import Enum
from functools import wraps
from typing import Callable


class Estado(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreakerAberto(Exception):
    pass


class CircuitBreaker:
    def __init__(
        self,
        nome: str,
        limite_falhas: int = 5,
        timeout_recuperacao: float = 60.0,
    ):
        self.nome = nome
        self.limite_falhas = limite_falhas
        self.timeout_recuperacao = timeout_recuperacao

        self._estado = Estado.CLOSED
        self._contagem_falhas = 0
        self._ultimo_tempo_falha: float = 0.0
        self._lock = threading.Lock()

    @property
    def estado(self) -> Estado:
        with self._lock:
            if self._estado == Estado.OPEN:
                if time.monotonic() - self._ultimo_tempo_falha >= self.timeout_recuperacao:
                    self._estado = Estado.HALF_OPEN
            return self._estado

    def _registrar_sucesso(self):
        with self._lock:
            self._contagem_falhas = 0
            self._estado = Estado.CLOSED

    def _registrar_falha(self):
        with self._lock:
            self._contagem_falhas += 1
            self._ultimo_tempo_falha = time.monotonic()
            if self._contagem_falhas >= self.limite_falhas:
                self._estado = Estado.OPEN

    def chamar(self, func: Callable, *args, **kwargs):
        estado_atual = self.estado

        if estado_atual == Estado.OPEN:
            raise CircuitBreakerAberto(
                f"Circuit breaker '{self.nome}' está OPEN. "
                f"Serviço indisponível. Tente novamente em instantes."
            )

        try:
            resultado = func(*args, **kwargs)
            self._registrar_sucesso()
            return resultado
        except Exception as exc:
            self._registrar_falha()
            raise exc

    async def chamar_async(self, func: Callable, *args, ignorar_excecoes: tuple = (), **kwargs):
        estado_atual = self.estado

        if estado_atual == Estado.OPEN:
            raise CircuitBreakerAberto(
                f"Circuit breaker '{self.nome}' está OPEN. "
                f"Serviço indisponível."
            )

        try:
            resultado = await func(*args, **kwargs)
            self._registrar_sucesso()
            return resultado
        except Exception as exc:
            # Erros de configuração (ex: credenciais inválidas) não contam como falha de serviço
            if not isinstance(exc, ignorar_excecoes):
                self._registrar_falha()
            raise exc

    def resetar(self):
        with self._lock:
            self._estado = Estado.CLOSED
            self._contagem_falhas = 0
            self._ultimo_tempo_falha = 0.0

    def __repr__(self):
        return (
            f"CircuitBreaker(nome={self.nome!r}, estado={self._estado}, "
            f"falhas={self._contagem_falhas}/{self.limite_falhas})"
        )


def circuit_breaker(nome: str, limite_falhas: int = 5, timeout_recuperacao: float = 60.0):
    """Decorator para aplicar circuit breaker em funções síncronas."""
    cb = CircuitBreaker(nome, limite_falhas, timeout_recuperacao)

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return cb.chamar(func, *args, **kwargs)
        wrapper._circuit_breaker = cb
        return wrapper

    return decorator


# Instâncias globais por serviço externo
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(nome: str) -> CircuitBreaker:
    if nome not in _breakers:
        from app.core.config import settings
        _breakers[nome] = CircuitBreaker(
            nome=nome,
            limite_falhas=settings.circuit_breaker_failure_threshold,
            timeout_recuperacao=settings.circuit_breaker_recovery_timeout,
        )
    return _breakers[nome]
