import json
from unittest.mock import AsyncMock, MagicMock, patch

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

    with patch("app.routers.risk.get_redis_client", return_value=None):
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

    with patch("app.routers.risk.get_redis_client", return_value=None):
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


@pytest.mark.asyncio
async def test_simulate_risk_scores_redis_cached():
    cached_payload = json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[80.15, 12.95], [80.19, 12.95], [80.19, 12.99], [80.15, 12.99], [80.15, 12.95]]]
            },
            "properties": {
                "risk_score": 0.88,
                "breakdown": {
                    "rainfall_impact": 0.5,
                    "flood_proximity": 0.9,
                    "elevation_drop": 0.7,
                    "report_density": 0.6
                }
            }
        }]
    })

    mock_redis = AsyncMock()
    mock_redis.get.return_value = cached_payload

    with patch("app.routers.risk.get_redis_client", return_value=mock_redis):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/risk-scores/simulate?rainfall=50.0")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["features"][0]["properties"]["risk_score"] == 0.88
    mock_redis.get.assert_called_once_with("risk:simulate:50.0:none")
    mock_redis.aclose.assert_called_once()

