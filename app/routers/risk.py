import json
import logging
import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.geo_constants import distance_to_water_corridor
from app.db.session import get_db
from app.models.enums import SOSStatus
from app.models.sos_report import SOSReport
from app.schemas.risk import (
    RiskBreakdown,
    RiskFeatureProperties,
    RiskGridCollection,
    RiskGridFeature,
    RiskPolygonGeometry,
)
from app.services.dispatch_optimizer import extract_coordinates

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["risk"])

CACHE_KEY_PREFIX = "risk:simulate"
CACHE_TTL_SECONDS = 3


async def get_redis_client() -> aioredis.Redis | None:
    """Returns async Redis client if available."""
    try:
        if settings.REDIS_URL:
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            return client
    except Exception as exc:
        logger.warning(f"Redis connection failed: {exc}")
    return None


@router.get(
    "/risk-scores/simulate",
    response_model=RiskGridCollection,
    status_code=status.HTTP_200_OK,
    summary="Simulate what-if flood risk grid scores based on rainfall intensity",
)
async def simulate_risk_scores(
    rainfall: Annotated[
        float,
        Query(
            description="Simulated rainfall intensity (0 to 100)",
            ge=0.0,
            le=100.0,
        ),
    ] = 0.0,
    db: AsyncSession = Depends(get_db),
) -> RiskGridCollection:
    """Ingests simulated rainfall intensity parameter, evaluates an explainable risk formula

    factoring rainfall, elevation drop, flood proximity, and active SOS report density,
    and returns a GeoJSON FeatureCollection of risk grid cells. Cached in Redis for 3s.
    """
    redis_client = await get_redis_client()
    cache_key = f"{CACHE_KEY_PREFIX}:{round(rainfall, 2)}"

    if redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                await redis_client.aclose()
                return RiskGridCollection(**json.loads(cached_data))
        except Exception as exc:
            logger.warning(f"Redis cache read error: {exc}")

    # 1. Fetch active/pending SOS reports to compute report density
    stmt = select(SOSReport).where(SOSReport.status.in_([SOSStatus.PENDING, SOSStatus.ASSIGNED]))
    result = await db.execute(stmt)
    active_reports = list(result.scalars().all())

    report_coords: list[tuple[float, float]] = []
    for rep in active_reports:
        try:
            report_coords.append(extract_coordinates(rep.location))
        except Exception:
            pass

    # 2. Determine spatial bounding box for the risk grid
    if report_coords:
        lons = [c[0] for c in report_coords]
        lats = [c[1] for c in report_coords]
        min_lon, max_lon = min(lons) - 0.04, max(lons) + 0.04
        min_lat, max_lat = min(lats) - 0.04, max(lats) + 0.04
    else:
        # Default region bounds (e.g. Chennai flood zone area)
        min_lon, max_lon = 80.15, 80.35
        min_lat, max_lat = 12.95, 13.15

    # 3. Create N x N grid cells (e.g. 5x5)
    grid_size = 5
    lon_step = (max_lon - min_lon) / grid_size
    lat_step = (max_lat - min_lat) / grid_size

    rainfall_impact = round(min(max(rainfall / 100.0, 0.0), 1.0), 4)

    features: list[RiskGridFeature] = []

    for i in range(grid_size):
        c_min_lon = min_lon + i * lon_step
        c_max_lon = c_min_lon + lon_step

        for j in range(grid_size):
            c_min_lat = min_lat + j * lat_step
            c_max_lat = c_min_lat + lat_step

            center_lon = (c_min_lon + c_max_lon) / 2.0
            center_lat = (c_min_lat + c_max_lat) / 2.0

            # 4. Itemized explainable score calculations
            # a) Flood proximity score (using shared water corridor line from geo_constants)
            dist_to_water_line = distance_to_water_corridor(center_lon, center_lat) / 0.15
            flood_proximity = round(max(0.0, 1.0 - min(dist_to_water_line, 1.0)), 4)

            # b) Elevation drop score (lowland hazard near coast / southern basin)
            elevation_drop = round(
                max(0.0, min(1.0, 0.85 - (center_lat - min_lat) / (lat_step * grid_size))), 4
            )

            # c) Report density score (SOS reports in cell bounds or close radius)
            reports_in_cell = sum(
                1
                for r_lon, r_lat in report_coords
                if c_min_lon <= r_lon <= c_max_lon and c_min_lat <= r_lat <= c_max_lat
            )
            report_density = round(min(1.0, reports_in_cell / 3.0), 4)

            # 5. Composite Risk Score
            composite_score = (
                0.40 * rainfall_impact
                + 0.25 * flood_proximity
                + 0.15 * elevation_drop
                + 0.20 * report_density
            )
            risk_score = round(min(max(composite_score, 0.0), 1.0), 4)

            # 6. GeoJSON Polygon ring: [[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y], [min_x, min_y]]
            ring: list[tuple[float, float]] = [
                (round(c_min_lon, 6), round(c_min_lat, 6)),
                (round(c_max_lon, 6), round(c_min_lat, 6)),
                (round(c_max_lon, 6), round(c_max_lat, 6)),
                (round(c_min_lon, 6), round(c_max_lat, 6)),
                (round(c_min_lon, 6), round(c_min_lat, 6)),
            ]

            feature = RiskGridFeature(
                type="Feature",
                geometry=RiskPolygonGeometry(type="Polygon", coordinates=[ring]),
                properties=RiskFeatureProperties(
                    risk_score=risk_score,
                    breakdown=RiskBreakdown(
                        rainfall_impact=rainfall_impact,
                        flood_proximity=flood_proximity,
                        elevation_drop=elevation_drop,
                        report_density=report_density,
                    ),
                ),
            )
            features.append(feature)

    response = RiskGridCollection(type="FeatureCollection", features=features)

    if redis_client:
        try:
            await redis_client.setex(cache_key, CACHE_TTL_SECONDS, response.model_dump_json())
            await redis_client.aclose()
        except Exception as exc:
            logger.warning(f"Redis cache write error: {exc}")

    return response

