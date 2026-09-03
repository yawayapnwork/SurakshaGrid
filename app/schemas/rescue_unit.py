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


class RescueUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    unit_type: RescueUnitType
    current_location: GeoPoint
    status: RescueUnitStatus
