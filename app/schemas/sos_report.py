import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SOSSeverity, SOSStatus
from app.schemas.geo import GeoPoint


class SOSReportBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: GeoPoint
    severity: SOSSeverity
    photo_url: str | None = Field(default=None, max_length=2048)
    voice_transcript: str | None = None


class SOSReportCreate(SOSReportBase):
    pass


class SOSReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    location: GeoPoint
    status: SOSStatus
    severity: SOSSeverity
    photo_url: str | None
    visual_confidence_score: float | None
    trust_score: int
    voice_transcript: str | None
    created_at: datetime
