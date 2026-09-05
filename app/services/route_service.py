"""Turn-by-turn driving route fetching via OSRM.

Distinct from `dispatch_optimizer.fetch_osrm_duration_matrix`, which only asks OSRM's
Table service for a bulk ETA matrix (no geometry, no steps) to feed the assignment
solver. This module asks OSRM's Route service for one specific unit->incident pair's
actual road geometry and turn-by-turn steps, for rendering a real route polyline and a
Blinkit/Uber-style navigation card instead of a straight line.
"""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RouteUnavailableError(Exception):
    """Raised when OSRM can't be reached, times out, or has no road route between the

    two points (e.g. they're not both near the loaded OSM road network). Callers turn
    this into a clean 503 rather than letting an OSRM outage crash the request.
    """


# OSRM's `maneuver.type`/`maneuver.modifier` are machine-readable, not prose — this maps
# them to short human instructions. Not every OSRM type is exhaustively distinguished
# (e.g. "notification" covers several minor path-continuation subtypes); those fall back
# to "Continue", which reads correctly even if slightly generic.
_MANEUVER_VERBS: dict[str, str] = {
    "depart": "Depart",
    "arrive": "Arrive",
    "turn": "Turn",
    "new name": "Continue",
    "merge": "Merge",
    "on ramp": "Take the ramp",
    "off ramp": "Take the exit",
    "fork": "Keep",
    "end of road": "Turn",
    "continue": "Continue",
    "roundabout": "Enter the roundabout",
    "rotary": "Enter the rotary",
    "roundabout turn": "At the roundabout, turn",
    "notification": "Continue",
    "exit roundabout": "Exit the roundabout",
    "exit rotary": "Exit the rotary",
}
_MODIFIER_VERBS = {"turn", "roundabout turn", "fork", "merge", "on ramp", "off ramp", "end of road"}


def _format_instruction(maneuver_type: str, modifier: str | None, road_name: str | None) -> str:
    verb = _MANEUVER_VERBS.get(maneuver_type, "Continue")
    modifier_text = f" {modifier}" if modifier and maneuver_type in _MODIFIER_VERBS else ""
    road_text = f" onto {road_name}" if road_name else ""
    return f"{verb}{modifier_text}{road_text}".strip()


async def fetch_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    timeout_seconds: float = 4.0,
) -> dict:
    """Fetches a driving route between (lon, lat) `origin` and `destination` from OSRM's

    Route service: full geometry (as GeoJSON LineString) plus turn-by-turn steps with
    human-readable instructions, distance, and duration. Raises RouteUnavailableError on
    any failure.
    """
    settings = get_settings()
    base_url = str(settings.OSRM_BASE_URL).rstrip("/")
    o_lon, o_lat = origin
    d_lon, d_lat = destination
    url = (
        f"{base_url}/route/v1/driving/{o_lon:.6f},{o_lat:.6f};{d_lon:.6f},{d_lat:.6f}"
        "?overview=full&geometries=geojson&steps=true"
    )

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(url)
    except httpx.HTTPError as exc:
        raise RouteUnavailableError(f"Failed to reach OSRM: {exc}") from exc

    if response.status_code != 200:
        raise RouteUnavailableError(f"OSRM returned HTTP {response.status_code}")

    try:
        data = response.json()
    except Exception as exc:
        raise RouteUnavailableError(f"OSRM returned an unparseable response: {exc}") from exc

    if data.get("code") != "Ok" or not data.get("routes"):
        raise RouteUnavailableError(f"OSRM found no route: {data.get('message', data.get('code', 'unknown error'))}")

    route = data["routes"][0]
    leg = route["legs"][0]

    steps = []
    for step in leg["steps"]:
        maneuver = step.get("maneuver", {})
        road_name = step.get("name") or None
        steps.append(
            {
                "instruction": _format_instruction(
                    maneuver.get("type", "continue"), maneuver.get("modifier"), road_name
                ),
                "distance_meters": float(step.get("distance", 0.0)),
                "duration_seconds": float(step.get("duration", 0.0)),
                "maneuver_type": maneuver.get("type", "continue"),
                "maneuver_modifier": maneuver.get("modifier"),
                "road_name": road_name,
            }
        )

    return {
        "geometry": route["geometry"],
        "distance_meters": float(route["distance"]),
        "duration_seconds": float(route["duration"]),
        "steps": steps,
    }
