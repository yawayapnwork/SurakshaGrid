import logging
from datetime import datetime
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def dispatch_sos_webhook(
    sos_id: str,
    severity: str,
    latitude: float,
    longitude: float,
    trust_score: int,
    created_at: str | datetime | None = None,
) -> bool:
    """Dispatches a JSON payload for critical or high-trust SOS reports to the configured n8n webhook URL.

    Uses a short 3-second timeout and catches all exceptions to ensure external network issues
    never block citizen-facing API handlers.
    """
    webhook_url = settings.N8N_SOS_WEBHOOK_URL
    if not webhook_url:
        return False

    created_at_str: str | None = None
    if isinstance(created_at, datetime):
        created_at_str = created_at.isoformat()
    elif isinstance(created_at, str):
        created_at_str = created_at

    payload = {
        "sos_id": str(sos_id),
        "severity": str(severity),
        "latitude": float(latitude),
        "longitude": float(longitude),
        "trust_score": int(trust_score),
        "created_at": created_at_str,
    }

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(webhook_url, json=payload)
            if response.is_success:
                logger.info(f"Successfully dispatched SOS webhook to {webhook_url} for sos_id={sos_id}")
                return True
            else:
                logger.warning(
                    f"SOS webhook call to {webhook_url} returned HTTP {response.status_code}: {response.text[:100]}"
                )
                return False
    except Exception as exc:
        logger.warning(f"Failed to dispatch SOS webhook to {webhook_url}: {exc}")
        return False
