from pydantic import BaseModel, ConfigDict, Field


class AudioTranscriptionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(description="English-translated transcript of the spoken audio")
    detected_language: str | None = Field(
        default=None, description="ISO-639-1 language code Whisper detected in the source audio"
    )
    duration_seconds: float | None = Field(default=None, description="Duration of the decoded audio clip")
