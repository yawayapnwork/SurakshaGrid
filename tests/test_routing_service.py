from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.routing import compute_unit_to_incident_eta


@pytest.mark.asyncio
async def test_compute_unit_to_incident_eta_osrm_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"durations": [[240.0]]}

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get.return_value = mock_resp

    with patch("httpx.AsyncClient", return_value=mock_client):
        eta = await compute_unit_to_incident_eta((80.25, 13.05), (80.27, 13.08), unit_type="BOAT")
        assert eta == 240.0


@pytest.mark.asyncio
async def test_compute_unit_to_incident_eta_timeout_haversine_fallback():
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get.side_effect = Exception("OSRM Timeout")

    with patch("httpx.AsyncClient", return_value=mock_client):
        eta_boat = await compute_unit_to_incident_eta((80.25, 13.05), (80.27, 13.08), unit_type="BOAT")
        eta_drone = await compute_unit_to_incident_eta((80.25, 13.05), (80.27, 13.08), unit_type="DRONE")

        assert eta_boat > 0
        assert eta_drone > 0
        # Drone (50 km/h) should have a faster ETA than Boat (25 km/h)
        assert eta_drone < eta_boat
