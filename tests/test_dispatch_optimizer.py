import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient, Response

from app.db.session import get_db
from app.main import app
from app.models.enums import RescueUnitStatus, RescueUnitType, SOSSeverity, SOSStatus
from app.models.rescue_unit import RescueUnit
from app.models.sos_report import SOSReport
from app.services.dispatch_optimizer import (
    compute_haversine_duration_matrix,
    fetch_osrm_duration_matrix,
    haversine_distance_meters,
    optimize_rescue_dispatch,
)


def test_haversine_distance_meters():
    # Distance between Chennai Marina Beach (13.0499, 80.2824) and Central Station (13.0827, 80.2707) ~ 3.8 km
    dist = haversine_distance_meters(13.0499, 80.2824, 13.0827, 80.2707)
    assert 3500 <= dist <= 4200


def test_compute_haversine_duration_matrix():
    units = [(80.2707, 13.0827), (80.2000, 13.0000)]
    incidents = [(80.2800, 13.0850)]
    matrix = compute_haversine_duration_matrix(units, incidents)
    assert matrix.shape == (2, 1)
    assert matrix[0, 0] < matrix[1, 0]  # First unit is much closer to incident


@pytest.mark.asyncio
async def test_fetch_osrm_duration_matrix_success():
    mock_response = Response(
        status_code=200,
        json={
            "code": "Ok",
            "durations": [[120.0, 300.0], [250.0, 90.0]],
        },
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        units = [(80.2, 13.0), (80.3, 13.1)]
        incidents = [(80.25, 13.05), (80.35, 13.15)]
        matrix = await fetch_osrm_duration_matrix(units, incidents)

        assert matrix is not None
        assert matrix.shape == (2, 2)
        assert matrix[0, 0] == 120.0


@pytest.mark.asyncio
async def test_fetch_osrm_duration_matrix_fallback_on_error():
    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection timed out")):
        units = [(80.2, 13.0)]
        incidents = [(80.25, 13.05)]
        matrix = await fetch_osrm_duration_matrix(units, incidents)
        assert matrix is None


@pytest.mark.asyncio
async def test_optimize_rescue_dispatch_success():
    sos1 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2707 13.0827)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.CRITICAL_TRAPPED,
        trust_score=3,
        created_at=datetime.now(timezone.utc),
    )
    sos2 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2000 13.0000)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.LOW,
        trust_score=0,
        created_at=datetime.now(timezone.utc),
    )

    unit1 = RescueUnit(
        id=uuid.uuid4(),
        name="Rescue Boat Alpha",
        unit_type=RescueUnitType.BOAT,
        current_location="SRID=4326;POINT(80.2700 13.0820)",
        status=RescueUnitStatus.AVAILABLE,
    )
    unit2 = RescueUnit(
        id=uuid.uuid4(),
        name="Ambulance Bravo",
        unit_type=RescueUnitType.AMBULANCE,
        current_location="SRID=4326;POINT(80.2010 13.0010)",
        status=RescueUnitStatus.AVAILABLE,
    )

    mock_db = AsyncMock()

    # Configure scalar executions for pending reports and available units
    mock_result_sos = MagicMock()
    mock_result_sos.scalars.return_value.all.return_value = [sos1, sos2]

    mock_result_units = MagicMock()
    mock_result_units.scalars.return_value.all.return_value = [unit1, unit2]

    mock_db.execute.side_effect = [mock_result_sos, mock_result_units]

    with patch("app.services.dispatch_optimizer.ws_manager.publish", new_callable=AsyncMock) as mock_pub:
        assignments = await optimize_rescue_dispatch(mock_db)

        assert len(assignments) == 2
        assert sos1.status == SOSStatus.ASSIGNED
        assert sos2.status == SOSStatus.ASSIGNED
        assert unit1.status == RescueUnitStatus.DISPATCHED
        assert unit2.status == RescueUnitStatus.DISPATCHED
        assert mock_db.commit.called
        assert mock_pub.call_count == 2


@pytest.mark.asyncio
async def test_optimize_rescue_dispatch_empty():
    mock_db = AsyncMock()
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result_empty

    assignments = await optimize_rescue_dispatch(mock_db)
    assert assignments == []


@pytest.mark.asyncio
async def test_dispatch_api_endpoint():
    from app.core.deps import get_current_officer

    mock_db = AsyncMock()
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result_empty

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_officer] = lambda: {"sub": "admin", "role": "officer"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/dispatch/optimize")

    app.dependency_overrides.clear()

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == []

