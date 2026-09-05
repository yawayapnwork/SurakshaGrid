from app.core.geo_constants import WATER_CORRIDOR_LINE, build_flood_zone_polygon, distance_to_water_corridor


def test_water_corridor_line_endpoints():
    assert WATER_CORRIDOR_LINE == ((80.15, 13.00), (80.35, 13.10))


def test_distance_to_water_corridor_on_line():
    # Center point (80.25, 13.05) lies directly on the corridor line y = 13.05 + 0.5 * (x - 80.25)
    dist = distance_to_water_corridor(80.25, 13.05)
    assert abs(dist) < 1e-9


def test_distance_to_water_corridor_offset():
    # Point at (80.25, 13.20) is 0.15 degrees above the line
    dist = distance_to_water_corridor(80.25, 13.20)
    assert abs(dist - 0.15) < 1e-9


def test_build_flood_zone_polygon():
    wkt, geojson = build_flood_zone_polygon(50.0)
    assert wkt.startswith("SRID=4326;POLYGON")
    assert geojson["type"] == "Polygon"

    ring = geojson["coordinates"][0]
    # A smoothed (meandering-line-buffer) extent, not the old hardcoded 4-corner
    # rectangle — expect many more than 5 points, and a properly closed ring.
    assert len(ring) > 10
    assert ring[0] == ring[-1]

    from shapely.geometry import shape

    polygon = shape(geojson)
    assert polygon.is_valid
    assert polygon.exterior.is_simple
