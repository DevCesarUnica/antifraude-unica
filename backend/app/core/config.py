from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent.parent.parent / ".env"

# Valores de desenvolvimento conhecidos — nunca podem chegar em produção.
# Cobre tanto o default do Python (config.py) quanto o default do
# docker-compose.yml (que usa uma string diferente para SECRET_KEY).
_SECRET_KEYS_INSEGURAS = {"mude-em-producao", "changeme-in-production"}
_TITAN_KEYS_INSEGURAS = {"123"}
_SENHA_DB_INSEGURA = "unica123"


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:unica123@localhost:5432/antifraude"

    # Redis / Celery — não usado no modo dev local
    redis_url: str = "redis://localhost:6379/0"

    # Titan API
    titan_base_url: str = "https://hope.titan.ceoslab.app/api"
    titan_api_key: str = "123"
    titan_cache_ttl: int = 3600
    titan_timeout: int = 30
    titan_max_retries: int = 3

    # Segurança
    secret_key: str = "mude-em-producao"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 8
    access_token_expire_minutes: int = 60

    # Storm API
    storm_base_url: str = "https://openapi.stormfin.com.br"
    storm_username: str = ""
    storm_password: str = ""
    storm_client_id: str = ""
    storm_client_secret: str = ""  # deixar vazio se a aplicação for público (public client)
    storm_timeout: int = 15
    storm_max_retries: int = 3

    # Circuit Breaker
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: int = 60

    # Geral
    log_level: str = "INFO"
    environment: str = "development"

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def _rejeitar_secrets_inseguros_em_producao(self) -> "Settings":
        """
        Fail-fast: se ENVIRONMENT=production e algum secret ainda estiver no
        valor padrão de desenvolvimento, o sistema não sobe — em vez de subir
        silenciosamente com uma chave JWT pública ou senha de banco conhecida
        (ver AUDITORIA_PRODUCAO.md, C7).
        """
        if self.environment != "production":
            return self

        inseguros = []
        if self.secret_key in _SECRET_KEYS_INSEGURAS:
            inseguros.append("SECRET_KEY")
        if self.titan_api_key in _TITAN_KEYS_INSEGURAS:
            inseguros.append("TITAN_API_KEY")
        if _SENHA_DB_INSEGURA in self.database_url:
            inseguros.append("DATABASE_URL")

        if inseguros:
            raise ValueError(
                "ENVIRONMENT=production, mas as seguintes variáveis ainda estão "
                f"com valor padrão de desenvolvimento: {', '.join(inseguros)}. "
                "Defina valores reais via variável de ambiente/.env antes de subir "
                "em produção — o sistema recusa iniciar assim para evitar uma "
                "chave JWT pública ou senha de banco conhecida em produção."
            )
        return self


settings = Settings()
