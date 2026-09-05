import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")


class SMSAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to: list[str] = Field(
        min_length=1,
        max_length=50,
        description="Recipient phone numbers in E.164 format, e.g. '+919876543210'",
    )
    message: str = Field(min_length=1, max_length=1600, description="Emergency alert message body")
    priority: Literal["low", "medium", "high", "critical"] = Field(
        default="medium", description="Priority level, echoed back for the client's own UI/logging"
    )

    @field_validator("to")
    @classmethod
    def _validate_e164(cls, value: list[str]) -> list[str]:
        invalid = [number for number in value if not _E164_PATTERN.match(number)]
        if invalid:
            raise ValueError(
                f"Invalid E.164 phone number(s): {', '.join(invalid)}. "
                "Expected a leading '+' and country code, e.g. '+919876543210'."
            )
        return value


class SMSAlertRecipientResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to: str
    sent: bool
    error: str | None = None


class SMSAlertResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    priority: str
    total: int
    sent_count: int
    failed_count: int
    results: list[SMSAlertRecipientResult]
