"""Geographic constants and geometric calculation utilities for flood simulation and risk scoring."""

# Standard water corridor endpoints around Chennai: (x1, y1) to (x2, y2)
WATER_CORRIDOR_LINE: tuple[tuple[float, float], tuple[float, float]] = (
    (80.15, 13.00),
    (80.35, 13.10),
)


def distance_to_water_corridor(lon: float, lat: float) -> float:
    """Calculates the vertical distance in degrees from (lon, lat) to the water corridor line."""
    (x1, y1), (x2, y2) = WATER_CORRIDOR_LINE
    slope = (y2 - y1) / (x2 - x1)
    y_corridor = y1 + slope * (lon - x1)
    return abs(lat - y_corridor)


def build_flood_zone_polygon(rainfall_intensity: float) -> tuple[str, dict]:
    """Generates PostGIS EWKT Polygon and GeoJSON geometry dict for a given rainfall intensity (0..100)."""
    rainfall_norm = min(max(rainfall_intensity, 0.0), 100.0)
    buffer_deg = 0.01 + (rainfall_norm / 100.0) * 0.05

    (x1, y1), (x2, y2) = WATER_CORRIDOR_LINE

    dx = x2 - x1
    dy = y2 - y1
    length = (dx * dx + dy * dy) ** 0.5

    nx = -dy / length
    ny = dx / length

    p1 = [round(x1 + nx * buffer_deg, 6), round(y1 + ny * buffer_deg, 6)]
    p2 = [round(x2 + nx * buffer_deg, 6), round(y2 + ny * buffer_deg, 6)]
    p3 = [round(x2 - nx * buffer_deg, 6), round(y2 - ny * buffer_deg, 6)]
    p4 = [round(x1 - nx * buffer_deg, 6), round(y1 - ny * buffer_deg, 6)]

    geojson_geom = {
        "type": "Polygon",
        "coordinates": [[p1, p2, p3, p4, p1]],
    }
    wkt = f"SRID=4326;POLYGON(({p1[0]} {p1[1]}, {p2[0]} {p2[1]}, {p3[0]} {p3[1]}, {p4[0]} {p4[1]}, {p1[0]} {p1[1]}))"
    return wkt, geojson_geom
