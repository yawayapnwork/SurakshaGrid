from functools import lru_cache

from typing import Annotated

from pydantic import AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Strictly validated runtime configuration, loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="forbid",
    )

    DATABASE_URL: str = Field(..., min_length=1)
    REDIS_URL: str = Field(..., min_length=1)
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)
    JWT_SECRET: str = Field(..., min_length=32)
    OSRM_BASE_URL: AnyUrl

    CLOUDINARY_CLOUD_NAME: str | None = Field(default=None)
    CLOUDINARY_API_KEY: str | None = Field(default=None)
    CLOUDINARY_API_SECRET: str | None = Field(default=None)

    ENVIRONMENT: str = Field(default="production")
    ADMIN_USERNAME: str = Field(default="admin")
    ADMIN_PASSWORD: str = Field(..., min_length=12, description="Bcrypt hash of the admin/dispatcher password")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60)
    N8N_INGESTION_SECRET: str = Field(default="surakshagrid-n8n-ingest-secret")
    N8N_SOS_WEBHOOK_URL: str | None = Field(default=None)
    N8N_SCENARIO_WEBHOOK_URL: str | None = Field(default=None)

    VLM_MODEL_ID: str = Field(default="vikhyatk/moondream2")
    VLM_MODEL_REVISION: str = Field(default="2024-08-26")

    # "openai/whisper-small" balances multilingual (Hindi/Tamil/etc.) accuracy against
    # inference speed on CPU-only hosts; swap to "openai/whisper-medium" or "-large-v3"
    # for higher accuracy when GPU memory is available.
    WHISPER_MODEL_ID: str = Field(default="openai/whisper-small")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> list[str]:
        """Accept a comma-separated string (as set on Render) or a JSON/native list."""
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        raise ValueError("CORS_ORIGINS must be a comma-separated string or a list of strings")

    @field_validator("DATABASE_URL")
    @classmethod
    def _require_asyncpg_driver(cls, value: str) -> str:
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use the 'postgresql+asyncpg://' driver for async SQLAlchemy"
            )
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
