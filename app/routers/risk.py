import json
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.geo_constants import distance_to_water_corridor, translated_water_corridor
from app.db.session import get_db
from app.models.enums import SOSStatus
from app.models.live_rainfall_reading import LiveRainfallReading
from app.models.sos_report import SOSReport
from app.schemas.live_rainfall import LiveRainfallCreate, LiveRainfallRead
from app.schemas.risk import (
    RiskBreakdown,
    RiskFeatureProperties,
    RiskGridCollection,
    RiskGridFeature,
    RiskPolygonGeometry,
)
from app.services.dispatch_optimizer import extract_coordinates
from app.services.spatial_risk_service import compute_dynamic_zone_risk_scores, zone_count
from app.services.ws_manager import ws_manager

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


@router.post(
    "/risk-scores/live-rainfall",
    response_model=LiveRainfallRead,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest live rainfall intensity reading from external sensors/APIs (n8n/OpenWeatherMap)",
)
async def create_live_rainfall_reading(
    payload: LiveRainfallCreate,
    x_n8n_secret: Annotated[str | None, Header(alias="X-N8N-Secret")] = None,
    db: AsyncSession = Depends(get_db),
) -> LiveRainfallRead:
    """Authenticates shared secret header, persists live rainfall reading to DB, and broadcasts WebSocket update."""
    if not x_n8n_secret or x_n8n_secret != settings.N8N_INGESTION_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-N8N-Secret ingestion header",
        )

    reading = LiveRainfallReading(
        id=uuid.uuid4(),
        timestamp=datetime.now(timezone.utc),
        rainfall_intensity=payload.rainfall_intensity,
        raw_mm=payload.raw_mm,
        source=payload.source,
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)

    # Broadcast real-time WebSocket notification to all connected clients
    await ws_manager.publish(
        "LIVE_RAINFALL_UPDATED",
        {
            "id": str(reading.id),
            "timestamp": reading.timestamp.isoformat() if reading.timestamp else None,
            "rainfall_intensity": reading.rainfall_intensity,
            "raw_mm": reading.raw_mm,
            "source": reading.source,
        },
    )

    return LiveRainfallRead.model_validate(reading)


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
    mode: Annotated[
        Literal["simulated", "live"],
        Query(description="Mode of operation: 'simulated' (uses slider parameter) or 'live' (uses latest ingested reading)"),
    ] = "simulated",
    sim_id: Annotated[
        str | None,
        Query(description="Optional active simulation ID to isolate risk density metrics"),
    ] = None,
    center_lon: Annotated[
        float | None,
        Query(description="Optional grid center longitude (e.g. the viewer's geolocation) for the synthetic fallback grid"),
    ] = None,
    center_lat: Annotated[
        float | None,
        Query(description="Optional grid center latitude (e.g. the viewer's geolocation) for the synthetic fallback grid"),
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> RiskGridCollection:
    """Ingests simulated rainfall intensity parameter, evaluates an explainable risk formula

    factoring rainfall, elevation drop, flood proximity, and active SOS report density,
    and returns a GeoJSON FeatureCollection of risk grid cells. Cached in Redis for 3s.
    """
    effective_rainfall = rainfall

    if mode == "live":
        live_stmt = select(LiveRainfallReading).order_by(LiveRainfallReading.timestamp.desc()).limit(1)
        live_res = await db.execute(live_stmt)
        latest_reading = live_res.scalar_one_or_none()
        if latest_reading:
            effective_rainfall = latest_reading.rainfall_intensity

    redis_client = await get_redis_client()
    center_key = f"{round(center_lon, 3)},{round(center_lat, 3)}" if center_lon is not None and center_lat is not None else "none"
    cache_key = f"{CACHE_KEY_PREFIX}:{mode}:{round(effective_rainfall, 2)}:{sim_id or 'none'}:{center_key}"

    if redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                await redis_client.aclose()
                return RiskGridCollection(**json.loads(cached_data))
        except Exception as exc:
            logger.warning(f"Redis cache read error: {exc}")

    try:
        response = await _build_risk_grid_response(db, effective_rainfall, sim_id, center_lon, center_lat)
    except Exception as exc:  # noqa: BLE001 - normalize any computation failure to a clean JSON error
        logger.exception(f"Failed to compute risk grid (rainfall={effective_rainfall}, mode={mode}): {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute risk scores for the current simulation parameters. Please try again.",
        ) from exc

    if redis_client:
        try:
            await redis_client.setex(cache_key, CACHE_TTL_SECONDS, response.model_dump_json())
            await redis_client.aclose()
        except Exception as exc:
            logger.warning(f"Redis cache write error: {exc}")

    return response


async def _build_risk_grid_response(
    db: AsyncSession,
    effective_rainfall: float,
    sim_id: str | None,
    center_lon: float | None,
    center_lat: float | None,
) -> RiskGridCollection:
    """Computes the risk grid: live PostGIS-driven scoring across designated emergency

    zones once they've been seeded, or the synthetic bounding-box grid formula below for
    a fresh/demo DB. Split out from the route handler so it can be wrapped in one
    try/except there instead of leaving computation errors to bubble up as an opaque 500.
    """
    if await zone_count(db) > 0:
        return await compute_dynamic_zone_risk_scores(db, effective_rainfall, sim_id, center_lon, center_lat)

    # 1. Fetch active/pending SOS reports to compute report density
    stmt = select(SOSReport).where(SOSReport.status.in_([SOSStatus.PENDING, SOSStatus.ASSIGNED]))
    if sim_id:
        stmt = stmt.where(SOSReport.sim_id == sim_id)

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
    elif center_lon is not None and center_lat is not None:
        # Center the same-sized synthetic grid on the viewer's real location instead of
        # forcing everyone onto the Chennai demo area.
        min_lon, max_lon = center_lon - 0.10, center_lon + 0.10
        min_lat, max_lat = center_lat - 0.10, center_lat + 0.10
    else:
        # Default region bounds (e.g. Chennai flood zone area)
        min_lon, max_lon = 80.15, 80.35
        min_lat, max_lat = 12.95, 13.15

    # Water corridor line translated to match the grid center, so flood_proximity stays
    # meaningful (a "virtual creek" running through wherever the grid is centered) instead
    # of measuring distance to a corridor that only makes sense in Chennai.
    corridor = translated_water_corridor((min_lon + max_lon) / 2.0, (min_lat + max_lat) / 2.0)

    # 3. Create N x N grid cells (e.g. 5x5)
    grid_size = 5
    lon_step = (max_lon - min_lon) / grid_size
    lat_step = (max_lat - min_lat) / grid_size

    rainfall_impact = round(min(max(effective_rainfall / 100.0, 0.0), 1.0), 4)

    features: list[RiskGridFeature] = []

    for i in range(grid_size):
        c_min_lon = min_lon + i * lon_step
        c_max_lon = c_min_lon + lon_step

        for j in range(grid_size):
            c_min_lat = min_lat + j * lat_step
            c_max_lat = c_min_lat + lat_step

            cell_center_lon = (c_min_lon + c_max_lon) / 2.0
            cell_center_lat = (c_min_lat + c_max_lat) / 2.0

            # 4. Itemized explainable score calculations
            # a) Flood proximity score (using shared water corridor line from geo_constants)
            dist_to_water_line = distance_to_water_corridor(cell_center_lon, cell_center_lat, corridor) / 0.15
            flood_proximity = round(max(0.0, 1.0 - min(dist_to_water_line, 1.0)), 4)

            # b) Elevation drop score (lowland hazard near coast / southern basin)
            elevation_drop = round(
                max(0.0, min(1.0, 0.85 - (cell_center_lat - min_lat) / (lat_step * grid_size))), 4
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

    return RiskGridCollection(type="FeatureCollection", features=features)

