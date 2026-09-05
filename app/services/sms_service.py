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
from app.core.phone_utils import format_phone_e164

logger = logging.getLogger(__name__)

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"

# Twilio REST API error codes worth surfacing as a specific, actionable message instead
# of Twilio's own (often generic) `message` field. Not exhaustive — anything not listed
# here still falls back to Twilio's raw message. Reference:
# https://www.twilio.com/docs/api/errors
_TWILIO_ERROR_HINTS: dict[int, str] = {
    20003: "Twilio authentication failed — check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.",
    21211: "Invalid 'To' phone number.",
    21212: "Invalid 'From' phone number.",
    21606: "The 'From' number is not a valid, SMS-capable Twilio number on this account.",
    21608: (
        "This is a Twilio trial account: it can only send SMS to phone numbers that have "
        "been verified in the Twilio console."
    ),
    21610: "Recipient has opted out (replied STOP) and cannot be sent SMS.",
    21614: "'To' number is not a valid mobile number that can receive SMS.",
    20429: "Twilio rate limit exceeded — too many requests sent too quickly.",
    21617: "Message body exceeds the maximum length Twilio allows.",
}


class SMSDeliveryError(Exception):
    """Raised when the SMS provider is unreachable, misconfigured, or rejects a message.

    Callers decide what to do with it: the on-demand /alerts/send-sms endpoint surfaces
    it as a client-facing error, while the automatic critical-SOS / dispatch-confirmation
    broadcasts only log it — a failed SMS must never fail or roll back the emergency
    dispatch flow that triggered it. Covers Twilio account restrictions (trial-mode
    unverified numbers, exhausted balance), invalid numbers, and network failures alike,
    so no raw Twilio/httpx exception ever escapes into a route handler.
    """


def check_twilio_configuration() -> bool:
    """Logs a clear warning for each missing/empty TWILIO_* variable at startup.

    Meant to be called once during FastAPI startup (see app.main's lifespan) so a
    misconfigured Render deployment fails loudly in the logs immediately, rather than
    silently dropping every SMS the first time a citizen files a critical SOS. Returns
    True if fully configured, False otherwise — SMS alerting stays optional either way.
    """
    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("TWILIO_ACCOUNT_SID", settings.TWILIO_ACCOUNT_SID),
            ("TWILIO_AUTH_TOKEN", settings.TWILIO_AUTH_TOKEN),
            ("TWILIO_PHONE_NUMBER", settings.TWILIO_PHONE_NUMBER),
        )
        if not value
    ]
    if missing:
        logger.warning(
            f"SMS alerting is disabled — missing environment variable(s): {', '.join(missing)}. "
            "Set these on Render (or your .env) to enable /api/alerts/send-sms and the "
            "automatic critical-SOS / dispatch-confirmation broadcasts."
        )
        return False
    logger.info("Twilio SMS alerting is configured.")
    return True


async def send_sms_alert(to: str, message: str) -> str:
    """Sends a single SMS via the Twilio REST API. Returns the provider message SID on

    success. Raises SMSDeliveryError on any failure — missing credentials, a number that
    can't be normalized to E.164, a rejected request (trial-account restrictions,
    exhausted balance, invalid number), or a network error — normalized to one exception
    type so callers don't need to know which Twilio/httpx exception shapes are possible.
    """
    settings = get_settings()
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER):
        raise SMSDeliveryError("SMS alerting is not configured (missing TWILIO_* environment variables)")

    try:
        to_e164 = format_phone_e164(to)
    except ValueError as exc:
        raise SMSDeliveryError(f"Cannot send SMS to '{to}': {exc}") from exc

    url = f"{TWILIO_API_BASE}/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                url,
                data={"To": to_e164, "From": settings.TWILIO_PHONE_NUMBER, "Body": message},
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
    except httpx.HTTPError as exc:
        raise SMSDeliveryError(f"Failed to reach Twilio for SMS to {to_e164}: {exc}") from exc

    if response.status_code >= 400:
        raise SMSDeliveryError(f"Twilio rejected SMS to {to_e164} (HTTP {response.status_code}): {_describe_twilio_error(response)}")

    try:
        return response.json().get("sid", "")
    except Exception:
        return ""


def _describe_twilio_error(response: httpx.Response) -> str:
    """Turns a Twilio REST API error response into a clear, actionable message —

    trial-account restrictions and exhausted-balance/invalid-number errors in
    particular read as generic 400s otherwise (see _TWILIO_ERROR_HINTS).
    """
    try:
        body = response.json()
    except Exception:
        return response.text[:200]

    code = body.get("code")
    raw_message = body.get("message", response.text[:200])
    hint = _TWILIO_ERROR_HINTS.get(code)
    return f"{hint} (Twilio error {code}: {raw_message})" if hint else f"{raw_message} (Twilio error {code})"


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
