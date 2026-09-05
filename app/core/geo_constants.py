"""Geographic constants and geometric calculation utilities for flood simulation and risk scoring."""

import math

from shapely.geometry import LineString, Polygon, mapping as shapely_mapping

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


def _saturating_radius_deg(intensity_norm: float, min_deg: float, max_deg: float, growth_rate: float) -> float:
    """Radius that grows fast at low intensity and flattens out at high intensity,

    instead of scaling linearly (and therefore unboundedly) with rainfall. This is what
    keeps a cloudburst reading dense/intense rather than geographically enormous: real
    convective cores don't expand to cover whole districts just because rainfall rate
    rises, they concentrate.
    """
    return min_deg + (max_deg - min_deg) * (1.0 - math.exp(-growth_rate * intensity_norm))


# Concentric reflectivity bands (outermost first), loosely modeled on radar dBZ bands:
# a broad, smooth light-rain fringe; a denser, moderately ragged heavy-rain band; and a
# small, jagged, high-density convective core. Each band's radius saturates
# independently (see _saturating_radius_deg) — the core in particular barely widens
# with intensity at all, so higher rainfall reads as a denser/darker/rougher core
# rather than a bigger polygon.
_REFLECTIVITY_BANDS: tuple[dict, ...] = (
    {
        "name": "light",
        "min_deg": 0.030,
        "max_deg": 0.090,
        "growth_rate": 0.035,
        "jag_base": 0.05,
        "jag_gain": 0.05,
        "opacity_min": 0.15,
        "opacity_max": 0.25,
        "dbz_min": 20.0,
        "dbz_max": 30.0,
        "phase": 0.0,
    },
    {
        "name": "heavy",
        "min_deg": 0.015,
        "max_deg": 0.050,
        "growth_rate": 0.045,
        "jag_base": 0.10,
        "jag_gain": 0.15,
        "opacity_min": 0.25,
        "opacity_max": 0.50,
        "dbz_min": 30.0,
        "dbz_max": 45.0,
        "phase": math.pi / 6,
    },
    {
        "name": "core",
        "min_deg": 0.006,
        "max_deg": 0.020,
        "growth_rate": 0.060,
        "jag_base": 0.15,
        "jag_gain": 0.35,
        "opacity_min": 0.35,
        "opacity_max": 0.80,
        "dbz_min": 45.0,
        "dbz_max": 60.0,
        "phase": math.pi / 3,
    },
)


def build_rainfall_reflectivity_bands(
    rainfall_intensity: float,
    center_lon: float,
    center_lat: float,
    num_points: int = 24,
) -> dict:
    """Generates a GeoJSON FeatureCollection of concentric rainfall contours around

    (center_lon, center_lat) — a light/heavy/core band per `_REFLECTIVITY_BANDS`,
    mimicking real weather-radar reflectivity (dBZ) rings instead of one polygon that
    balloons in radius with intensity.

    Only each band's *radius* uses a saturating (1 - e^-x) curve, so it grows quickly at
    low rainfall and flattens out — the storm concentrates rather than spreading over an
    unrealistic area. Rainfall intensity instead mostly drives, per band:
      - `opacity` (precipitation density) — climbs across the whole 0-100 range, giving
        a visibly denser/darker overlay for a cloudburst even where radius has plateaued;
      - contour jaggedness — higher intensity means a rougher, more convective-looking
        border (real storms get more turbulent at their edges as they intensify), while
        the outer light-rain band stays comparatively smooth (stratiform rain is broad
        and even).

    Bands are returned outermost-first (light, heavy, core) so a single MapLibre fill
    layer painting them in source order draws the core on top.
    """
    num_points = max(16, min(32, num_points))
    rainfall_norm = min(max(rainfall_intensity, 0.0), 100.0)
    intensity_frac = rainfall_norm / 100.0

    # Longitude degrees compress toward the poles relative to latitude degrees; correct
    # for that so each band reads as a round blob on the map instead of an ellipse.
    lon_scale = 1.0 / max(math.cos(math.radians(center_lat)), 0.01)

    features: list[dict] = []
    for band in _REFLECTIVITY_BANDS:
        radius_deg = _saturating_radius_deg(rainfall_norm, band["min_deg"], band["max_deg"], band["growth_rate"])
        jaggedness = min(band["jag_base"] + band["jag_gain"] * intensity_frac, 0.6)
        opacity = round(band["opacity_min"] + (band["opacity_max"] - band["opacity_min"]) * intensity_frac, 3)
        reflectivity_dbz = round(band["dbz_min"] + (band["dbz_max"] - band["dbz_min"]) * intensity_frac, 1)

        points: list[tuple[float, float]] = []
        for i in range(num_points):
            theta = 2 * math.pi * i / num_points
            wobble = jaggedness * math.sin(3 * theta + band["phase"] + rainfall_norm * 0.05) + (
                0.5 * jaggedness
            ) * math.sin(5 * theta - band["phase"] - rainfall_norm * 0.03)
            radius = radius_deg * (1 + wobble)
            points.append(
                (
                    center_lon + radius * lon_scale * math.cos(theta),
                    center_lat + radius * math.sin(theta),
                )
            )
        points.append(points[0])  # close the ring

        polygon = Polygon(points).buffer(0)  # heals any incidental self-intersection
        polygon = polygon.simplify(radius_deg * 0.02, preserve_topology=True)

        geojson_geom = shapely_mapping(polygon)
        geojson_geom["coordinates"] = [
            [[round(x, 6), round(y, 6)] for x, y in ring] for ring in geojson_geom["coordinates"]
        ]

        features.append(
            {
                "type": "Feature",
                "geometry": geojson_geom,
                "properties": {
                    "band": band["name"],
                    "rainfall": round(rainfall_norm, 2),
                    "radius_deg": round(radius_deg, 6),
                    "opacity": opacity,
                    "reflectivity_dbz": reflectivity_dbz,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}
