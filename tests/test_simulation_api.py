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
    exec_mock = MagicMock()
    exec_mock.scalar.return_value = 0
    mock_task_db.execute = AsyncMock(return_value=exec_mock)

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    redis_store = {}
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = lambda k: redis_store.get(k)
    mock_redis.set.side_effect = lambda k, v: redis_store.update({k: v})
    mock_redis.delete.side_effect = lambda k: redis_store.pop(k, None)
    mock_redis.aclose = AsyncMock()

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock), \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("app.routers.simulation.dispatch_scenario_webhook", new_callable=AsyncMock), \
         patch("app.routers.simulation.aioredis.from_url", return_value=mock_redis), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "started"
        assert "sim_id" in data
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
    exec_mock = MagicMock()
    exec_mock.scalar.return_value = 12
    mock_task_db.execute = AsyncMock(return_value=exec_mock)

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    redis_store = {}
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = lambda k: redis_store.get(k)
    mock_redis.set.side_effect = lambda k, v: redis_store.update({k: v})
    mock_redis.delete.side_effect = lambda k: redis_store.pop(k, None)
    mock_redis.aclose = AsyncMock()

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub, \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("app.routers.simulation.dispatch_scenario_webhook", new_callable=AsyncMock) as mock_webhook, \
         patch("app.routers.simulation.aioredis.from_url", return_value=mock_redis), \
         patch("asyncio.sleep", new_callable=AsyncMock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/simulation/trigger")

        app.dependency_overrides.clear()

        # 1. Assert immediate response
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "started"

        # 2. Assert background task used AsyncSessionLocal to insert reports, flood zones & SCENARIO_COMPLETE event (12 SOS + 4 ZONE + 1 SCENARIO = 17 commits)
        assert mock_task_db.add.called
        assert mock_task_db.commit.call_count == 17
        assert mock_pub.called
        assert mock_webhook.called


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
    exec_mock = MagicMock()
    exec_mock.scalar.return_value = 0
    mock_task_db.execute = AsyncMock(return_value=exec_mock)

    class MockTaskSessionContext:
        async def __aenter__(self):
            return mock_task_db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    redis_store = {}
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = lambda k: redis_store.get(k)
    mock_redis.set.side_effect = lambda k, v: redis_store.update({k: v})
    mock_redis.delete.side_effect = lambda k: redis_store.pop(k, None)
    mock_redis.aclose = AsyncMock()

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock), \
         patch("app.routers.simulation.AsyncSessionLocal", side_effect=MockTaskSessionContext), \
         patch("app.routers.simulation.dispatch_scenario_webhook", new_callable=AsyncMock), \
         patch("app.routers.simulation.aioredis.from_url", return_value=mock_redis), \
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

    redis_store = {}
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = lambda k: redis_store.get(k)
    mock_redis.set.side_effect = lambda k, v: redis_store.update({k: v})
    mock_redis.delete.side_effect = lambda k: redis_store.pop(k, None)
    mock_redis.aclose = AsyncMock()

    with patch("app.routers.simulation.ws_manager.publish", new_callable=AsyncMock) as mock_pub, \
         patch("app.routers.simulation.aioredis.from_url", return_value=mock_redis):
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


@pytest.mark.asyncio
async def test_dispatch_scenario_webhook_service():
    from app.services.webhook_dispatcher import dispatch_scenario_webhook

    # Test 1: No webhook URL configured
    with patch("app.services.webhook_dispatcher.settings.N8N_SCENARIO_WEBHOOK_URL", new=None):
        res_none = await dispatch_scenario_webhook("sim-123", 12, 3, 45.2)
        assert res_none is False

    # Test 2: Webhook URL configured and HTTP post succeeds
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_client.post.return_value = mock_response

    class MockAsyncClientContext:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return mock_client

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.services.webhook_dispatcher.settings.N8N_SCENARIO_WEBHOOK_URL", new="http://test-webhook.org/scenario"):
        with patch("httpx.AsyncClient", side_effect=MockAsyncClientContext):
            res_success = await dispatch_scenario_webhook("sim-123", 12, 3, 45.2)
            assert res_success is True
            assert mock_client.post.called
            call_kwargs = mock_client.post.call_args.kwargs
            assert call_kwargs["json"]["sim_id"] == "sim-123"
            assert call_kwargs["json"]["total_sos_count"] == 12
            assert call_kwargs["json"]["dispatched_unit_count"] == 3
            assert call_kwargs["json"]["duration_seconds"] == 45.2

    # Test 3: Webhook URL configured but HTTP call raises exception (graceful handling)
    with patch("app.services.webhook_dispatcher.settings.N8N_SCENARIO_WEBHOOK_URL", new="http://test-webhook.org/scenario"):
        with patch("httpx.AsyncClient", side_effect=Exception("Network error")):
            res_fail = await dispatch_scenario_webhook("sim-123", 12, 3, 45.2)
            assert res_fail is False


