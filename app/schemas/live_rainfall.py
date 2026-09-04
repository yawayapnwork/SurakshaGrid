import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LiveRainfallCreate(BaseModel):
    """Payload for ingesting live rainfall readings from n8n / OpenWeatherMap."""

    rainfall_intensity: float = Field(..., description="Calculated rainfall intensity (0 to 100)")
    raw_mm: float = Field(..., description="Raw rainfall in millimeters")
    source: str = Field(default="openweathermap", description="Source API / sensor identifier")


class LiveRainfallRead(BaseModel):
    """Response model for ingested live rainfall reading."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    timestamp: datetime
    rainfall_intensity: float
    raw_mm: float
    source: str
