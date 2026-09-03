from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_simulate_risk_scores_default():
    mock_db = AsyncMock()
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result_empty

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/risk-scores/simulate?rainfall=0.0")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["type"] == "FeatureCollection"
    assert "features" in data
    assert len(data["features"]) > 0

    first_feature = data["features"][0]
    assert first_feature["type"] == "Feature"
    assert first_feature["geometry"]["type"] == "Polygon"

    props = first_feature["properties"]
    assert 0.0 <= props["risk_score"] <= 1.0
    breakdown = props["breakdown"]
    assert breakdown["rainfall_impact"] == 0.0
    assert 0.0 <= breakdown["flood_proximity"] <= 1.0
    assert 0.0 <= breakdown["elevation_drop"] <= 1.0
    assert 0.0 <= breakdown["report_density"] <= 1.0


@pytest.mark.asyncio
async def test_simulate_risk_scores_high_rainfall():
    mock_db = AsyncMock()
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result_empty

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res_low = await ac.get("/api/v1/risk-scores/simulate?rainfall=10.0")
        res_high = await ac.get("/api/v1/risk-scores/simulate?rainfall=90.0")

    app.dependency_overrides.clear()

    assert res_low.status_code == status.HTTP_200_OK
    assert res_high.status_code == status.HTTP_200_OK

    low_data = res_low.json()
    high_data = res_high.json()

    assert high_data["features"][0]["properties"]["breakdown"]["rainfall_impact"] == 0.9
    assert (
        high_data["features"][0]["properties"]["risk_score"]
        > low_data["features"][0]["properties"]["risk_score"]
    )


@pytest.mark.asyncio
async def test_simulate_risk_scores_validation_error():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp_neg = await ac.get("/api/v1/risk-scores/simulate?rainfall=-10.0")
        resp_over = await ac.get("/api/v1/risk-scores/simulate?rainfall=150.0")

    assert resp_neg.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert resp_over.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
