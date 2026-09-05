from typing import Literal

from pydantic import BaseModel, Field


class RiskBreakdown(BaseModel):
    rainfall_impact: float = Field(..., ge=0.0, le=1.0, description="Score for rainfall intensity impact")
    flood_proximity: float = Field(..., ge=0.0, le=1.0, description="Score for proximity to water bodies")
    elevation_drop: float = Field(..., ge=0.0, le=1.0, description="Score for low terrain/elevation hazard")
    report_density: float = Field(..., ge=0.0, le=1.0, description="Score for active SOS report density")


class RiskFeatureProperties(BaseModel):
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Overall risk score between 0.0 and 1.0")
    breakdown: RiskBreakdown
    zone_id: str | None = Field(
        default=None, description="Stable emergency zone ID, used by the frontend to tween fill-color transitions by feature id rather than replacing the whole layer"
    )
    zone_name: str | None = Field(default=None, description="Human-readable emergency zone name")


class RiskPolygonGeometry(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(
        ..., description="List of polygon ring coordinates [[lon, lat], ...]"
    )


class RiskGridFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: RiskPolygonGeometry
    properties: RiskFeatureProperties


class RiskGridCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[RiskGridFeature]
