import json
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo_constants import (
    DEFAULT_GRID_CENTER,
    MAX_FLOOD_PROXIMITY_METERS,
    REPORT_DENSITY_RADIUS_METERS,
    REPORT_DENSITY_SATURATION_COUNT,
    WATER_CORRIDOR_LINE,
)
from app.models.enums import SOSStatus
from app.schemas.risk import RiskBreakdown, RiskFeatureProperties, RiskGridCollection, RiskGridFeature

logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = [SOSStatus.PENDING.value, SOSStatus.ASSIGNED.value]

# Single spatial query computing, per designated emergency zone:
#   - distance_to_water_m : real geodesic distance (meters) from the zone to the water
#                            corridor line, via geography-cast ST_Distance
#   - elevation_m         : average elevation of grid points inside the zone, falling
#                            back to the nearest elevation point (KNN via the <-> operator)
#                            when no sampled point falls inside the polygon
#   - report_count        : active SOS reports within the zone (or within
#                            REPORT_DENSITY_RADIUS_METERS of its boundary), via
#                            geography-cast ST_DWithin
#   - geometry_geojson    : the zone polygon simplified (topology-preserving) and emitted
#                            with 6 decimal digits, to keep payloads small for MapLibre
#
# `:delta_lon`/`:delta_lat` translate every seeded zone/elevation-point geometry by the
# same offset (viewer's real location minus the default Chennai grid center) before any
# distance/containment math runs, so the whole designated-zone scene — including its
# shape and relative position to the water corridor — moves as one rigid body to wherever
# the viewer is, instead of only recoloring in place. They default to 0 (no shift) when no
# viewer location is supplied. Active SOS report positions are deliberately NOT shifted —
# real incident reports stay where they were actually filed, matching how the synthetic
# grid fallback (see risk.py) also leaves real report_coords untranslated.
_ZONE_RISK_QUERY = text(
    """
    WITH corridor AS (
        SELECT ST_SetSRID(
            ST_MakeLine(
                ST_MakePoint(:corridor_x1, :corridor_y1),
                ST_MakePoint(:corridor_x2, :corridor_y2)
            ),
            4326
        )::geography AS geog
    ),
    shifted_zones AS (
        SELECT id, name, ST_Translate(geometry, :delta_lon, :delta_lat) AS geometry
        FROM emergency_zones
    ),
    shifted_elevation_points AS (
        SELECT id, ST_Translate(geometry, :delta_lon, :delta_lat) AS geometry, elevation_m
        FROM elevation_points
    ),
    elevation_bounds AS (
        SELECT
            COALESCE(MIN(elevation_m), 0.0) AS min_elev,
            COALESCE(MAX(elevation_m), 1.0) AS max_elev
        FROM shifted_elevation_points
    ),
    zone_elevation_contained AS (
        SELECT z.id AS zone_id, AVG(e.elevation_m) AS avg_elevation
        FROM shifted_zones z
        JOIN shifted_elevation_points e ON ST_Contains(z.geometry, e.geometry)
        GROUP BY z.id
    ),
    zone_elevation_nearest AS (
        SELECT DISTINCT ON (z.id)
            z.id AS zone_id,
            e.elevation_m AS nearest_elevation
        FROM shifted_zones z
        JOIN LATERAL (
            SELECT elevation_m
            FROM shifted_elevation_points
            ORDER BY geometry <-> ST_Centroid(z.geometry)
            LIMIT 1
        ) e ON true
    ),
    zone_reports AS (
        SELECT z.id AS zone_id, COUNT(r.id) AS report_count
        FROM shifted_zones z
        LEFT JOIN sos_reports r
            ON ST_DWithin(z.geometry::geography, r.location::geography, :density_radius_m)
            AND r.status = ANY(:active_statuses)
            AND (:sim_id IS NULL OR r.sim_id = :sim_id)
        GROUP BY z.id
    )
    SELECT
        z.id::text AS zone_id,
        z.name AS zone_name,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(z.geometry, 0.0001), 6) AS geometry_geojson,
        ST_Distance(z.geometry::geography, corridor.geog) AS distance_to_water_m,
        COALESCE(zec.avg_elevation, zen.nearest_elevation, eb.max_elev) AS elevation_m,
        eb.min_elev,
        eb.max_elev,
        COALESCE(zr.report_count, 0) AS report_count
    FROM shifted_zones z
    CROSS JOIN corridor
    CROSS JOIN elevation_bounds eb
    LEFT JOIN zone_elevation_contained zec ON zec.zone_id = z.id
    LEFT JOIN zone_elevation_nearest zen ON zen.zone_id = z.id
    LEFT JOIN zone_reports zr ON zr.zone_id = z.id
    ORDER BY z.name;
    """
)


async def zone_count(db: AsyncSession) -> int:
    """Cheap existence check so callers can fall back to a synthetic grid when no

    emergency zones have been seeded yet (e.g. a fresh dev database).
    """
    result = await db.execute(text("SELECT COUNT(*) FROM emergency_zones"))
    return int(result.scalar_one())


async def compute_dynamic_zone_risk_scores(
    db: AsyncSession,
    rainfall_multiplier: float,
    sim_id: str | None = None,
    center_lon: float | None = None,
    center_lat: float | None = None,
) -> RiskGridCollection:
    """Computes an updated spatial risk weight for every designated emergency zone using

    live PostGIS geometry: real geodesic distance to the flood-prone water corridor,
    sampled regional elevation (grid-average within the zone, or nearest sample as a
    fallback), and active SOS incident density, combined with the current rainfall
    intensity multiplier from the What-If slider.

    When `center_lon`/`center_lat` are given (e.g. the viewer's real geolocation), every
    zone and elevation-point geometry is rigidly translated by the offset between that
    point and the default Chennai grid center before any math runs, so the designated
    zones themselves relocate near the viewer instead of only their fill color updating.

    Returns a GeoJSON FeatureCollection whose polygons are simplified/precision-trimmed
    for fast MapLibre rendering, and whose features carry a stable `zone_id` so the
    frontend can animate fill-color transitions per feature instead of replacing the
    whole layer on every slider tick.
    """
    if center_lon is not None and center_lat is not None:
        default_lon, default_lat = DEFAULT_GRID_CENTER
        delta_lon, delta_lat = center_lon - default_lon, center_lat - default_lat
    else:
        delta_lon, delta_lat = 0.0, 0.0

    (corridor_x1, corridor_y1), (corridor_x2, corridor_y2) = WATER_CORRIDOR_LINE

    rows = (
        await db.execute(
            _ZONE_RISK_QUERY,
            {
                "corridor_x1": corridor_x1 + delta_lon,
                "corridor_y1": corridor_y1 + delta_lat,
                "corridor_x2": corridor_x2 + delta_lon,
                "corridor_y2": corridor_y2 + delta_lat,
                "delta_lon": delta_lon,
                "delta_lat": delta_lat,
                "density_radius_m": REPORT_DENSITY_RADIUS_METERS,
                "active_statuses": _ACTIVE_STATUSES,
                "sim_id": sim_id,
            },
        )
    ).mappings().all()

    rainfall_impact = round(min(max(rainfall_multiplier / 100.0, 0.0), 1.0), 4)

    features: list[RiskGridFeature] = []
    for row in rows:
        try:
            geometry_dict = json.loads(row["geometry_geojson"])
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            logger.warning(f"Skipping zone '{row.get('zone_id')}' with unparseable geometry: {exc}")
            continue

        max_distance = max(MAX_FLOOD_PROXIMITY_METERS, 1.0)
        flood_proximity = round(max(0.0, 1.0 - min(row["distance_to_water_m"] / max_distance, 1.0)), 4)

        min_elev, max_elev = row["min_elev"], row["max_elev"]
        elevation_range = max(max_elev - min_elev, 1e-6)
        # Lower elevation => higher hazard, so the normalized position is inverted.
        elevation_drop = round(max(0.0, min(1.0, 1.0 - (row["elevation_m"] - min_elev) / elevation_range)), 4)

        report_density = round(min(1.0, row["report_count"] / REPORT_DENSITY_SATURATION_COUNT), 4)

        composite_score = (
            0.40 * rainfall_impact + 0.25 * flood_proximity + 0.15 * elevation_drop + 0.20 * report_density
        )
        risk_score = round(min(max(composite_score, 0.0), 1.0), 4)

        features.append(
            RiskGridFeature(
                type="Feature",
                geometry=geometry_dict,
                properties=RiskFeatureProperties(
                    risk_score=risk_score,
                    breakdown=RiskBreakdown(
                        rainfall_impact=rainfall_impact,
                        flood_proximity=flood_proximity,
                        elevation_drop=elevation_drop,
                        report_density=report_density,
                    ),
                    zone_id=row["zone_id"],
                    zone_name=row["zone_name"],
                ),
            )
        )

    return RiskGridCollection(type="FeatureCollection", features=features)
