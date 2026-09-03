import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app
from app.models.event_log import EventLog


@pytest.mark.asyncio
async def test_get_replay_events_all():
    now = datetime.now(timezone.utc)
    log1 = EventLog(
        id=uuid.uuid4(),
        event_type="SOS_CREATED",
        payload={"sos_id": "test-1"},
        occurred_at=now,
    )
    log2 = EventLog(
        id=uuid.uuid4(),
        event_type="UNIT_DISPATCHED",
        payload={"sos_id": "test-1", "unit_name": "Boat-1"},
        occurred_at=now,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [log1, log2]
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/replay")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    assert data[0]["event_type"] == "SOS_CREATED"
    assert data[1]["event_type"] == "UNIT_DISPATCHED"


@pytest.mark.asyncio
async def test_get_replay_events_since():
    now = datetime.now(timezone.utc)
    log1 = EventLog(
        id=uuid.uuid4(),
        event_type="UNIT_DISPATCHED",
        payload={"sos_id": "test-1"},
        occurred_at=now,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [log1]
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    since_str = "2026-09-03T12:00:00Z"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(f"/api/v1/replay?since={since_str}")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["event_type"] == "UNIT_DISPATCHED"


@pytest.mark.asyncio
async def test_get_replay_events_filters():
    now = datetime.now(timezone.utc)
    target_id = str(uuid.uuid4())
    log1 = EventLog(
        id=uuid.UUID(target_id),
        event_type="SOS_CONFIRMED",
        payload={"sim_id": "sim-100", "sos_id": "sos-200"},
        occurred_at=now,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [log1]
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(
            f"/api/v1/replay?sim_id=sim-100&event_id={target_id}&limit=50&until=2026-09-03T23:59:59Z"
        )

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["event_type"] == "SOS_CONFIRMED"

