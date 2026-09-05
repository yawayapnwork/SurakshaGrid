from pydantic import BaseModel, ConfigDict, Field


class SpeechSynthesisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=1000, description="Broadcast/warning text to synthesize")
    voice: str | None = Field(default=None, description="Kokoro voice preset, e.g. 'af_heart', 'am_michael'")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Playback speed multiplier")
