from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:unica123@localhost:5432/antifraude"

    # Redis / Celery — não usado no modo dev local
    redis_url: str = "redis://localhost:6379/0"

    # Titan API
    titan_base_url: str = "https://hope.titan.ceoslab.app/api"
    titan_api_key: str = "123"
    titan_cache_ttl: int = 3600
    titan_timeout: int = 10
    titan_max_retries: int = 3

    # Segurança
    secret_key: str = "mude-em-producao"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 8
    access_token_expire_minutes: int = 60

    # Circuit Breaker
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: int = 60

    # Geral
    log_level: str = "INFO"
    environment: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
