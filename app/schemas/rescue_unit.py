import uuid

from pydantic import BaseModel, ConfigDict

from app.models.enums import RescueUnitStatus, RescueUnitType
from app.schemas.geo import GeoPoint


class RescueUnitBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    unit_type: RescueUnitType
    current_location: GeoPoint


class RescueUnitCreate(RescueUnitBase):
    pass


from typing import Any
from geoalchemy2.shape import to_shape
from pydantic import field_validator

class RescueUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    unit_type: RescueUnitType
    current_location: GeoPoint
    status: RescueUnitStatus
    sim_id: str | None = None

    @field_validator("current_location", mode="before")
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
