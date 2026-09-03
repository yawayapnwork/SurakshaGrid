import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SOSConfirmationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sos_id: uuid.UUID


class SOSConfirmationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sos_id: uuid.UUID
    confirmed_at: datetime
