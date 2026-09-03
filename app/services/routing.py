import logging
import math

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SPEED_KMH_MAP = {
    "BOAT": 25.0,
    "AMBULANCE": 40.0,
    "DRONE": 50.0,
}
DEFAULT_SPEED_KMH = 30.0


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in kilometers using Haversine formula."""
    r = 6371.0  # Radius of Earth in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


async def compute_unit_to_incident_eta(
    unit_coords: tuple[float, float],
    incident_coords: tuple[float, float],
    unit_type: str = "BOAT",
    osrm_url: str | None = None,
) -> float:
    """Computes ETA in seconds from unit coordinates (lon, lat) to incident coordinates (lon, lat).

    Uses OSRM Table Service with a strict 1.5s timeout. Immediately falls back to Haversine
    geographic distance with realistic vehicle speeds (BOAT: 25 km/h, AMBULANCE: 40 km/h, DRONE: 50 km/h)
    if OSRM fails or times out. Never raises an unhandled exception.
    """
    raw_base_url = osrm_url or (str(settings.OSRM_BASE_URL) if settings.OSRM_BASE_URL else "http://router.project-osrm.org")
    base_url = str(raw_base_url).rstrip("/")
    unit_lon, unit_lat = unit_coords
    inc_lon, inc_lat = incident_coords

    # Attempt OSRM Table Service query with 1.5s timeout
    try:
        table_url = f"{base_url}/table/v1/driving/{unit_lon},{unit_lat};{inc_lon},{inc_lat}?sources=0&destinations=1"
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(table_url)
            if resp.status_code == 200:
                data = resp.json()
                durations = data.get("durations")
                if durations and len(durations) > 0 and len(durations[0]) > 0:
                    dur_val = durations[0][0]
                    if dur_val is not None:
                        return float(dur_val)
    except Exception as exc:
        logger.warning(f"OSRM routing query timed out or failed ({exc}). Falling back to Haversine distance.")

    # Fallback to Haversine geographic distance calculation
    dist_km = haversine_distance_km(unit_lat, unit_lon, inc_lat, inc_lon)
    unit_type_upper = str(unit_type).upper()
    speed_kmh = SPEED_KMH_MAP.get(unit_type_upper, DEFAULT_SPEED_KMH)

    # ETA seconds = (distance_km / speed_kmh) * 3600 seconds/hour
    eta_seconds = (dist_km / speed_kmh) * 3600.0
    return max(30.0, eta_seconds)
