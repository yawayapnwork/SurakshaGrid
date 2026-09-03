import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EventLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: str
    payload: dict[str, Any] = {}


class EventLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: str
    payload: dict[str, Any]
    occurred_at: datetime
