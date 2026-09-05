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

    # Optional: OpenWeatherMap API key used as a direct fallback (see
    # app/services/weather_service.py) when no n8n-ingested reading exists near a
    # requested location. Leave unset to rely solely on n8n-pushed readings.
    OPENWEATHER_API_KEY: str | None = Field(default=None)

    # Twilio credentials for direct SMS alerting (POST /api/alerts/send-sms, and the
    # automated critical-SOS / dispatch-confirmation broadcasts below). Optional — SMS
    # alerting is simply disabled wherever any of these three is unset.
    TWILIO_ACCOUNT_SID: str | None = Field(default=None)
    TWILIO_AUTH_TOKEN: str | None = Field(default=None)
    TWILIO_PHONE_NUMBER: str | None = Field(default=None)

    # Comma-separated E.164 phone numbers (e.g. "+919876543210,+14155552671") of
    # registered dispatchers/responders who automatically receive an SMS when a
    # CRITICAL_TRAPPED SOS report is filed or a rescue dispatch round completes. Empty
    # disables the *automatic* broadcasts only — the on-demand /alerts/send-sms endpoint
    # still works against whatever recipients a caller supplies.
    DISPATCHER_ALERT_PHONE_NUMBERS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    VLM_MODEL_ID: str = Field(default="vikhyatk/moondream2")
    VLM_MODEL_REVISION: str = Field(default="2024-08-26")

    # "openai/whisper-small" balances multilingual (Hindi/Tamil/etc.) accuracy against
    # inference speed on CPU-only hosts; swap to "openai/whisper-medium" or "-large-v3"
    # for higher accuracy when GPU memory is available.
    WHISPER_MODEL_ID: str = Field(default="openai/whisper-small")

    NLLB_MODEL_ID: str = Field(default="facebook/nllb-200-distilled-600M")

    KOKORO_VOICE: str = Field(default="af_heart")
    KOKORO_LANG_CODE: str = Field(default="a")  # 'a' = American English voice pack

    # Caps how many of {VLM, Whisper, NLLB} may sit loaded in memory at once. 0 disables
    # eviction (fine with plenty of RAM); 1 is the safe default for small Render instances —
    # loading a second model evicts whichever model was used least recently. See
    # app/services/model_registry.py for the eviction policy this drives.
    MAX_RESIDENT_MODELS: int = Field(default=1, ge=0)

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

    @field_validator("DISPATCHER_ALERT_PHONE_NUMBERS", mode="before")
    @classmethod
    def _parse_dispatcher_alert_phone_numbers(cls, value: object) -> list[str]:
        """Accept a comma-separated string (as set on Render) or a JSON/native list."""
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [number.strip() for number in value.split(",") if number.strip()]
        if isinstance(value, list):
            return [str(number).strip() for number in value if str(number).strip()]
        raise ValueError("DISPATCHER_ALERT_PHONE_NUMBERS must be a comma-separated string or a list of strings")

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
