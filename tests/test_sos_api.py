import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app
from app.models.enums import SOSSeverity, SOSStatus
from app.models.sos_report import SOSReport
from app.services.cv_service import estimate_water_confidence
from tests.test_cv_service import create_synthetic_image_bytes


@pytest.fixture
def mock_db():
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_create_sos_report_with_image(mock_db):
    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    image_bytes = create_synthetic_image_bytes(b=40, g=100, r=160)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/api/v1/sos",
            data={
                "latitude": "13.0827",
                "longitude": "80.2707",
                "severity": "CRITICAL_TRAPPED",
                "voice_transcript": "Flood water entering first floor!",
            },
            files={
                "image": ("test_flood.jpg", image_bytes, "image/jpeg")
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["severity"] == "CRITICAL_TRAPPED"
    assert data["voice_transcript"] == "Flood water entering first floor!"
    assert data["location"]["coordinates"] == [80.2707, 13.0827]
    assert data["photo_url"] is not None
    assert isinstance(data["visual_confidence_score"], float)
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_create_sos_report_without_image(mock_db):
    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/api/v1/sos",
            data={
                "latitude": "12.9716",
                "longitude": "77.5946",
                "severity": "HIGH",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["severity"] == "HIGH"
    assert data["location"]["coordinates"] == [77.5946, 12.9716]
    assert data["photo_url"] is None
    assert data["visual_confidence_score"] is None


@pytest.mark.asyncio
async def test_confirm_sos_report(mock_db):
    report_id = uuid.uuid4()
    mock_report = SOSReport(
        id=report_id,
        location="SRID=4326;POINT(80.2707 13.0827)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.HIGH,
        trust_score=2,
        created_at=datetime.now(timezone.utc),
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_report
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(f"/api/v1/sos/{report_id}/confirm")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["sos_id"] == str(report_id)
    assert mock_report.trust_score == 3
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_confirm_sos_report_not_found(mock_db):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    missing_id = uuid.uuid4()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(f"/api/v1/sos/{missing_id}/confirm")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_404_NOT_FOUND
