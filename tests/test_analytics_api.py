from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_get_live_analytics_api():
    mock_db = AsyncMock()

    # Mock DB query result scalar
    mock_result = MagicMock()
    mock_result.scalar.return_value = 5
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.routers.analytics.get_redis_client", return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/analytics/live-stats")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["monitored_area_km2"] == 42.5
        assert data["total_sos_logged"] == 5
        assert data["active_sos_count"] == 5
        assert data["dispatched_units_count"] == 5
        assert data["available_units_count"] == 5
        assert data["avg_eta_minutes"] == 4.5
