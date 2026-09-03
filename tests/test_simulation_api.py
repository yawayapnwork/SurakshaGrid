from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_trigger_simulation_api():
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"
        assert data["seeded_units"] == 7
        assert data["seeded_reports"] == 12
        assert mock_db.commit.called
        assert mock_pub.call_count >= 13  # 1 reset event + 12 created SOS reports


@pytest.mark.asyncio
async def test_reset_simulation_api():
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/reset")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"
        assert mock_db.commit.called
        assert mock_pub.called
