import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.geo_constants import (
    build_flood_zone_polygon,
    build_rainfall_reflectivity_bands,
    translated_water_corridor,
)
from app.db.session import get_db
from app.models.flood_zone import FloodZone

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["flood-zones"])

CACHE_KEY_PREFIX = "flood_zones:simulate"
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
    "/flood-zones/simulate",
    status_code=status.HTTP_200_OK,
    summary="Simulate what-if flood zone extent polygon based on rainfall intensity or active simulation",
)
async def simulate_flood_zones(
    db: AsyncSession = Depends(get_db),
    rainfall: Annotated[
        float,
        Query(
            description="Simulated rainfall intensity (0 to 100)",
            ge=0.0,
            le=100.0,
        ),
    ] = 0.0,
    sim_id: Annotated[
        str | None,
        Query(description="Optional active simulation ID to read latest persisted flood zone"),
    ] = None,
    center_lon: Annotated[
        float | None,
        Query(description="Optional zone center longitude (e.g. the viewer's geolocation) for the synthetic fallback zone"),
    ] = None,
    center_lat: Annotated[
        float | None,
        Query(description="Optional zone center latitude (e.g. the viewer's geolocation) for the synthetic fallback zone"),
    ] = None,
) -> dict:
    """Reads the latest persisted flood zone polygon for an active sim_id or rainfall intensity,
    or falls back to generating the matching polygon buffer representation. Cached in Redis for 3s.
    """
    redis_client = await get_redis_client()
    center_key = f"{round(center_lon, 3)},{round(center_lat, 3)}" if center_lon is not None and center_lat is not None else "none"
    cache_key = f"{CACHE_KEY_PREFIX}:{round(rainfall, 2)}:{sim_id or 'none'}:{center_key}"

    if redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                await redis_client.aclose()
                return json.loads(cached_data)
        except Exception as exc:
            logger.warning(f"Redis cache read error: {exc}")

    try:
        result_data = None

        # 1. Try fetching latest persisted FloodZone record for sim_id
        if sim_id:
            stmt = select(FloodZone).where(FloodZone.sim_id == sim_id).order_by(FloodZone.created_at.desc())
            res = await db.execute(stmt)
            latest_zone = res.scalars().first()
            if latest_zone:
                try:
                    shape = to_shape(latest_zone.geometry)
                    coords = [[[round(pt[0], 6), round(pt[1], 6)] for pt in shape.exterior.coords]]
                    result_data = {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": coords,
                                },
                                "properties": {
                                    "rainfall": round(latest_zone.rainfall_intensity, 2),
                                    "sim_id": latest_zone.sim_id,
                                    "zone_id": str(latest_zone.id),
                                },
                            }
                        ],
                    }
                except Exception as exc:
                    logger.warning(f"Failed to parse persisted flood zone geometry for sim_id={sim_id}: {exc}")

        # 2. Fall back to shared polygon calculation formula
        if not result_data:
            if center_lon is not None and center_lat is not None:
                # A real (geolocated) center reads naturally as concentric radar-style
                # reflectivity bands (light/heavy/core) around that point rather than a
                # corridor buffer.
                result_data = build_rainfall_reflectivity_bands(rainfall, center_lon, center_lat)
            else:
                corridor = translated_water_corridor(center_lon, center_lat)
                _, geojson_geom = build_flood_zone_polygon(rainfall, corridor)
                buffer_deg = 0.01 + (min(max(rainfall, 0.0), 100.0) / 100.0) * 0.05

                result_data = {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": geojson_geom,
                            "properties": {
                                "rainfall": round(rainfall, 2),
                                "buffer_degrees": round(buffer_deg, 6),
                            },
                        }
                    ],
                }
    except Exception as exc:  # noqa: BLE001 - normalize any computation failure to a clean JSON error
        logger.exception(f"Failed to compute flood zone (rainfall={rainfall}, sim_id={sim_id}): {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute the flood zone extent for the current simulation parameters. Please try again.",
        ) from exc

    if redis_client:
        try:
            await redis_client.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result_data))
            await redis_client.aclose()
        except Exception as exc:
            logger.warning(f"Redis cache write error: {exc}")

    return result_data


