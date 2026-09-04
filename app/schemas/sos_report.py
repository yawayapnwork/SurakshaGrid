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


from typing import Any
from geoalchemy2.shape import to_shape
from pydantic import field_validator

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
    sim_id: str | None = None
    created_at: datetime

    @field_validator("location", mode="before")
    @classmethod
    def _convert_location(cls, value: Any) -> GeoPoint | dict[str, Any]:
        if isinstance(value, GeoPoint):
            return value
        if isinstance(value, dict):
            return value
        if hasattr(value, "x") and hasattr(value, "y"):
            return GeoPoint(type="Point", coordinates=(float(value.x), float(value.y)))
        if hasattr(value, "data") or hasattr(value, "srid") or hasattr(value, "desc"):
            try:
                shape = to_shape(value)
                return GeoPoint(type="Point", coordinates=(float(shape.x), float(shape.y)))
            except Exception:
                pass
        val_str = str(value)
        if "POINT" in val_str:
            clean_str = val_str.split(";")[-1].replace("POINT(", "").replace(")", "").strip()
            parts = clean_str.split()
            if len(parts) >= 2:
                return GeoPoint(type="Point", coordinates=(float(parts[0]), float(parts[1])))
        return GeoPoint(type="Point", coordinates=(80.2707, 13.0827))

