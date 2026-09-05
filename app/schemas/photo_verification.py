from pydantic import BaseModel, ConfigDict, Field


class PhotoVerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verified: bool = Field(description="Whether the image depicts a genuine flood hazard")
    confidence: float = Field(ge=0.0, le=1.0, description="Model confidence in the verdict")
    summary: str = Field(description="Short human-readable description of the detected hazard")
