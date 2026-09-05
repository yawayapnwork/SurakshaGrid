from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RouteGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]


class RouteStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(description="Human-readable turn instruction, e.g. 'Turn right onto Anna Salai'")
    distance_meters: float
    duration_seconds: float
    maneuver_type: str
    maneuver_modifier: str | None = None
    road_name: str | None = None


class DispatchRouteResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    geometry: RouteGeometry
    distance_meters: float
    duration_seconds: float
    steps: list[RouteStep]
