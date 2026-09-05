"""SMS alert delivery via the Twilio REST API.

Uses a plain async HTTP client (httpx) rather than the official `twilio` SDK: that SDK's
client is synchronous, and calling it from an async route would block the event loop
unless wrapped in a threadpool. Talking to Twilio's REST API directly with httpx keeps
this consistent with the rest of the codebase's async-first services (see
webhook_dispatcher.py) and avoids a second, blocking HTTP client dependency.
"""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


class SMSDeliveryError(Exception):
    """Raised when the SMS provider is unreachable, misconfigured, or rejects a message.

    Callers decide what to do with it: the on-demand /alerts/send-sms endpoint surfaces
    it as a client-facing error, while the automatic critical-SOS / dispatch-confirmation
    broadcasts only log it — a failed SMS must never fail or roll back the emergency
    dispatch flow that triggered it.
    """


async def send_sms_alert(to: str, message: str) -> str:
    """Sends a single SMS via the Twilio REST API. Returns the provider message SID on

    success. Raises SMSDeliveryError on any failure — missing credentials, a rejected
    request, or a network error — normalized to one exception type so callers don't need
    to know which Twilio/httpx exception shapes are possible.
    """
    settings = get_settings()
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER):
        raise SMSDeliveryError("SMS alerting is not configured (missing TWILIO_* environment variables)")

    url = f"{TWILIO_API_BASE}/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                url,
                data={"To": to, "From": settings.TWILIO_PHONE_NUMBER, "Body": message},
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
    except httpx.HTTPError as exc:
        raise SMSDeliveryError(f"Failed to reach Twilio for SMS to {to}: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("message", response.text[:200])
        except Exception:
            detail = response.text[:200]
        raise SMSDeliveryError(f"Twilio rejected SMS to {to} (HTTP {response.status_code}): {detail}")

    try:
        return response.json().get("sid", "")
    except Exception:
        return ""


async def broadcast_sms_alert(to_numbers: list[str], message: str) -> list[tuple[str, bool, str | None]]:
    """Sends the same message to multiple recipients, one at a time, never letting one

    recipient's failure stop delivery to the rest. Returns a (phone_number, sent, error)
    tuple per recipient so the caller can report exact per-recipient outcomes.
    """
    results: list[tuple[str, bool, str | None]] = []
    for to in to_numbers:
        try:
            sid = await send_sms_alert(to, message)
            logger.info(f"SMS alert sent to {to} (sid={sid or 'unknown'})")
            results.append((to, True, None))
        except SMSDeliveryError as exc:
            logger.warning(f"SMS alert failed for {to}: {exc}")
            results.append((to, False, str(exc)))
    return results
