from typing import Literal

from pydantic import BaseModel, Field, field_validator


class GeoPoint(BaseModel):
    """GeoJSON Point representation, always WGS84 (SRID 4326)."""

    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float] = Field(
        ..., description="[longitude, latitude] in decimal degrees"
    )

    @field_validator("coordinates")
    @classmethod
    def _validate_bounds(cls, value: tuple[float, float]) -> tuple[float, float]:
        lon, lat = value
        if not (-180.0 <= lon <= 180.0):
            raise ValueError("longitude must be between -180 and 180")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError("latitude must be between -90 and 90")
        return value
