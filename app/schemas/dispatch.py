import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DispatchAssignment(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sos_id: uuid.UUID
    rescue_unit_id: uuid.UUID
    unit_name: str
    eta_seconds: float
    cost: float
    assigned_at: datetime
