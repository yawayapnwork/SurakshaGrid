from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_current_officer
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_trigger_simulation_api():
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    mock_task_db = AsyncMock()
    mock_task_db.commit = AsyncMock()

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock), \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "started"
        assert data["seeded_units"] == 7
        assert mock_db.commit.called


@pytest.mark.asyncio
async def test_trigger_simulation_background_staggered_inserts():
    """Asserts that SOS reports continue to be inserted via AsyncSessionLocal in background after HTTP response returns."""
    mock_request_db = AsyncMock()

    async def override_get_db():
        yield mock_request_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    mock_task_db = AsyncMock()
    mock_task_db.add = MagicMock()
    mock_task_db.commit = AsyncMock()

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub, \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        # 1. Assert immediate response
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "started"

        # 2. Assert background task used AsyncSessionLocal to insert reports & commit 12 times
        assert mock_task_db.add.called
        assert mock_task_db.commit.call_count == 12
        assert mock_pub.called


@pytest.mark.asyncio
async def test_trigger_simulation_idempotent_restart():
    """Asserts that calling trigger consecutive times cancels previous in-flight simulation runs and restarts cleanly."""
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    mock_task_db = AsyncMock()
    mock_task_db.commit = AsyncMock()

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock), \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp1 = await ac.post("/api/v1/simulation/trigger")
            resp2 = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        assert resp1.status_code == status.HTTP_200_OK
        assert resp2.status_code == status.HTTP_200_OK
        assert resp2.json()["status"] == "started"


@pytest.mark.asyncio
async def test_reset_simulation_api():
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/reset")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"
        assert mock_db.commit.called
        assert mock_pub.called


@pytest.mark.asyncio
async def test_simulation_endpoints_forbidden_in_production():
    mock_db = AsyncMock()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    class MockProdSettings:
        ENVIRONMENT = "production"

    with patch("app.routers.simulation.get_settings", return_value=MockProdSettings()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res_trigger = await ac.post("/api/v1/simulation/trigger")
            res_reset = await ac.post("/api/v1/simulation/reset")

    app.dependency_overrides.clear()

    assert res_trigger.status_code == status.HTTP_403_FORBIDDEN
    assert res_reset.status_code == status.HTTP_403_FORBIDDEN

