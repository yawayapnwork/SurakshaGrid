import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_simulate_flood_zones_default():
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
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/flood-zones/simulate?rainfall=75")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    feature = data["features"][0]
    assert feature["properties"]["rainfall"] == 75.0
    assert feature["properties"]["buffer_degrees"] == 0.0475
    # Confirm polygon ring expands
    coords = feature["geometry"]["coordinates"][0]
    assert len(coords) == 5
