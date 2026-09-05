import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_officer
from app.schemas.sms_alert import SMSAlertRecipientResult, SMSAlertRequest, SMSAlertResponse
from app.services.sms_service import broadcast_sms_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["alerts"])


@router.post(
    "/alerts/send-sms",
    response_model=SMSAlertResponse,
    status_code=status.HTTP_200_OK,
    summary="Broadcast an SMS emergency alert to one or more recipients via Twilio",
)
async def send_sms_alert_endpoint(
    payload: SMSAlertRequest,
    officer: dict = Depends(get_current_officer),
) -> SMSAlertResponse:
    """Sends `payload.message` to every number in `payload.to` via Twilio. Each recipient

    is attempted independently — one bad number never blocks delivery to the rest — and
    the response reports exact per-recipient success/failure so the frontend can show
    which numbers actually received the alert. Gated behind officer auth since sending SMS
    costs money and could otherwise be abused as an open relay.
    """
    results = await broadcast_sms_alert(payload.to, payload.message)
    sent_count = sum(1 for _, sent, _ in results if sent)
    failed_count = len(results) - sent_count

    if sent_count == 0:
        logger.warning(f"SMS alert failed for every recipient: {[to for to, _, _ in results]}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to deliver the SMS alert to any recipient. Check the Twilio "
            "configuration and recipient phone numbers.",
        )

    return SMSAlertResponse(
        priority=payload.priority,
        total=len(results),
        sent_count=sent_count,
        failed_count=failed_count,
        results=[SMSAlertRecipientResult(to=to, sent=sent, error=error) for to, sent, error in results],
    )
