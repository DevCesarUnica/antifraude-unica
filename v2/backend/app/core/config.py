from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Banco
    database_url: str = "postgresql://unica:unica123@localhost:5432/antifraude"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Titan API
    titan_base_url: str = "https://hope.titan.ceoslab.app/api"
    titan_api_key: str = "123"
    titan_cache_ttl: int = 3600
    titan_timeout: int = 10
    titan_max_retries: int = 3

    # Segurança
    secret_key: str = "mude-em-producao"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Circuit Breaker
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: int = 60

    # Geral
    log_level: str = "INFO"
    environment: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
