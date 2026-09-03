from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Request, status

from app.core.rate_limiter import check_sos_rate_limit


@pytest.mark.asyncio
async def test_rate_limiter_under_limit():
    request = MagicMock(spec=Request)
    request.headers.get.return_value = None
    request.client.host = "192.168.1.10"

    mock_redis = AsyncMock()
    mock_redis.incr.return_value = 3

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("app.core.rate_limiter.settings.REDIS_URL", "redis://localhost:6379"):
            # Should not raise exception
            await check_sos_rate_limit(request)


@pytest.mark.asyncio
async def test_rate_limiter_exceeds_limit():
    request = MagicMock(spec=Request)
    request.headers.get.return_value = None
    request.client.host = "192.168.1.10"

    mock_redis = AsyncMock()
    mock_redis.incr.return_value = 6  # 6th request

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("app.core.rate_limiter.settings.REDIS_URL", "redis://localhost:6379"):
            with pytest.raises(HTTPException) as exc_info:
                await check_sos_rate_limit(request)
            assert exc_info.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.asyncio
async def test_rate_limiter_fail_open_on_redis_error():
    request = MagicMock(spec=Request)
    request.headers.get.return_value = None
    request.client.host = "192.168.1.10"

    with patch("redis.asyncio.from_url", side_effect=Exception("Redis connection error")):
        with patch("app.core.rate_limiter.settings.REDIS_URL", "redis://localhost:6379"):
            # Fail-open design: should not raise exception, allowing request
            await check_sos_rate_limit(request)
