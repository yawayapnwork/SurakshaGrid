import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_simulate_flood_zones_default():
    with patch("app.routers.flood_zones.get_redis_client", return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/flood-zones/simulate")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1
    feature = data["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Polygon"
    assert feature["properties"]["rainfall"] == 0.0
    assert feature["properties"]["buffer_degrees"] == 0.01


@pytest.mark.asyncio
async def test_simulate_flood_zones_expanded():
    with patch("app.routers.flood_zones.get_redis_client", return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/flood-zones/simulate?rainfall=75")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    feature = data["features"][0]
    assert feature["properties"]["rainfall"] == 75.0
    assert feature["properties"]["buffer_degrees"] == 0.0475
    # Confirm polygon ring expands: a smoothed extent, not the old 4-corner rectangle.
    coords = feature["geometry"]["coordinates"][0]
    assert len(coords) > 10
    assert coords[0] == coords[-1]


@pytest.mark.asyncio
async def test_simulate_flood_zones_with_sim_id():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.routers.flood_zones.get_redis_client", return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/flood-zones/simulate?sim_id=test-sim-id-123&rainfall=50")

    app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1
    assert data["features"][0]["geometry"]["type"] == "Polygon"


@pytest.mark.asyncio
async def test_simulate_flood_zones_redis_cached():
    cached_payload = json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[80.15, 12.95], [80.25, 12.95], [80.25, 13.05], [80.15, 13.05], [80.15, 12.95]]]
            },
            "properties": {
                "rainfall": 75.0,
                "buffer_degrees": 0.0475
            }
        }]
    })

    mock_redis = AsyncMock()
    mock_redis.get.return_value = cached_payload

    with patch("app.routers.flood_zones.get_redis_client", return_value=mock_redis):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/flood-zones/simulate?rainfall=75&sim_id=sim-99")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["features"][0]["properties"]["rainfall"] == 75.0
    mock_redis.get.assert_called_once_with("flood_zones:simulate:75.0:sim-99:none")
    mock_redis.aclose.assert_called_once()



