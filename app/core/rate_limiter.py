import logging

from fastapi import HTTPException, Request, status
import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

RATE_LIMIT_REQUESTS = 5
RATE_LIMIT_WINDOW_SECONDS = 60


async def check_sos_rate_limit(request: Request) -> None:
    """Enforces Redis-backed rate limiting on unauthenticated SOS submissions.

    Max 5 requests per IP address per 60-second window. Fail-open fallback if Redis is unreachable.
    """
    # Extract client IP address
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host
    else:
        client_ip = "127.0.0.1"

    rate_key = f"rate_limit:sos:{client_ip}"

    try:
        if settings.REDIS_URL:
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            current_count = await client.incr(rate_key)
            if current_count == 1:
                await client.expire(rate_key, RATE_LIMIT_WINDOW_SECONDS)
            await client.aclose()

            if current_count > RATE_LIMIT_REQUESTS:
                logger.warning(f"Rate limit exceeded for IP {client_ip}: {current_count} requests in 60s")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many SOS submissions from this IP. Please wait 1 minute before trying again.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Redis rate limit check bypassed due to connection error: {exc}")
