"""Geographic constants and geometric calculation utilities for flood simulation and risk scoring."""

import math

from shapely.geometry import LineString, mapping as shapely_mapping

# Standard water corridor endpoints around Chennai: (x1, y1) to (x2, y2)
WATER_CORRIDOR_LINE: tuple[tuple[float, float], tuple[float, float]] = (
    (80.15, 13.00),
    (80.35, 13.10),
)

# Center of the default synthetic demo grid (Chennai). Used only to translate the
# water corridor line when a caller supplies a different grid center (e.g. the
# viewer's real geolocation) via `translated_water_corridor`, so the synthetic
# flood-proximity scene keeps the same shape wherever it's recentered.
DEFAULT_GRID_CENTER: tuple[float, float] = (80.25, 13.05)  # (lon, lat)


def translated_water_corridor(
    center_lon: float | None, center_lat: float | None
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Shifts WATER_CORRIDOR_LINE so it stays positioned relative to `center` the same

    way it's positioned relative to DEFAULT_GRID_CENTER. Returns WATER_CORRIDOR_LINE
    unchanged when no center is supplied.
    """
    if center_lon is None or center_lat is None:
        return WATER_CORRIDOR_LINE

    default_lon, default_lat = DEFAULT_GRID_CENTER
    delta_lon = center_lon - default_lon
    delta_lat = center_lat - default_lat
    (x1, y1), (x2, y2) = WATER_CORRIDOR_LINE
    return ((x1 + delta_lon, y1 + delta_lat), (x2 + delta_lon, y2 + delta_lat))

# Beyond this distance from the water corridor, flood proximity risk is treated as zero.
MAX_FLOOD_PROXIMITY_METERS: float = 3000.0

# Radius (in meters) around a zone boundary within which active SOS reports still count
# toward that zone's incident density, so reports just outside a polygon edge aren't dropped.
REPORT_DENSITY_RADIUS_METERS: float = 250.0

# Active reports within a zone at/above this count saturate the report_density score to 1.0.
REPORT_DENSITY_SATURATION_COUNT: float = 3.0


def distance_to_water_corridor(
    lon: float,
    lat: float,
    corridor: tuple[tuple[float, float], tuple[float, float]] = WATER_CORRIDOR_LINE,
) -> float:
    """Calculates the vertical distance in degrees from (lon, lat) to the water corridor line."""
    (x1, y1), (x2, y2) = corridor
    slope = (y2 - y1) / (x2 - x1)
    y_corridor = y1 + slope * (lon - x1)
    return abs(lat - y_corridor)


def _meandering_corridor_linestring(
    corridor: tuple[tuple[float, float], tuple[float, float]],
    amplitude_deg: float,
    segments: int = 10,
) -> LineString:
    """Builds a multi-point LineString along `corridor` with a gentle sinusoidal meander

    perpendicular to it, instead of one perfectly straight segment. Deterministic (no
    randomness) so the same corridor + rainfall intensity always reproduces the same
    shape. This is what keeps the buffered flood extent below from reading as a ruler-
    straight rectangle even before rounding its corners.
    """
    (x1, y1), (x2, y2) = corridor
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length  # unit normal, perpendicular to the corridor

    points: list[tuple[float, float]] = []
    for i in range(segments + 1):
        t = i / segments
        x = x1 + dx * t
        y = y1 + dy * t
        meander = math.sin(t * 2 * math.pi) * amplitude_deg
        points.append((x + nx * meander, y + ny * meander))
    return LineString(points)


def build_flood_zone_polygon(
    rainfall_intensity: float,
    corridor: tuple[tuple[float, float], tuple[float, float]] = WATER_CORRIDOR_LINE,
) -> tuple[str, dict]:
    """Generates a PostGIS EWKT Polygon and GeoJSON geometry dict for a given rainfall

    intensity (0..100): a multi-point meandering line along `corridor`, buffered with
    round caps/joins via Shapely. This replaces the old 4-corner parallelogram (a hand-
    rolled perpendicular-offset rectangle) with a smooth, organically-shaped extent —
    rounded ends and curved sides instead of sharp rectangle corners.
    """
    rainfall_norm = min(max(rainfall_intensity, 0.0), 100.0)
    buffer_deg = 0.01 + (rainfall_norm / 100.0) * 0.05

    # Meander amplitude scales with the buffer itself so the buffer always dominates the
    # linework and the result stays a simple (non-self-intersecting) polygon.
    corridor_line = _meandering_corridor_linestring(corridor, amplitude_deg=buffer_deg * 0.3)
    polygon = corridor_line.buffer(buffer_deg, cap_style="round", join_style="round", quad_segs=12)
    # Simplify slightly to cap point count for payload size, without eroding the shape.
    polygon = polygon.simplify(buffer_deg * 0.05, preserve_topology=True)

    geojson_geom = shapely_mapping(polygon)
    geojson_geom["coordinates"] = [
        [[round(x, 6), round(y, 6)] for x, y in ring] for ring in geojson_geom["coordinates"]
    ]

    wkt = f"SRID=4326;{polygon.wkt}"
    return wkt, geojson_geom
