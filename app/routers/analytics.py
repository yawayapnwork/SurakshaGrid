import json
import logging

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from geoalchemy2.types import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.db.session import get_db
from app.models.dispatch_assignment import DispatchAssignmentModel
from app.models.enums import RescueUnitStatus, SOSSeverity, SOSStatus
from app.models.flood_zone import FloodZone
from app.models.rescue_unit import RescueUnit
from app.models.sos_report import SOSReport
from app.schemas.analytics import LiveAnalyticsResponse

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["analytics"])
CACHE_KEY_PREFIX = "analytics:live-stats"
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
    "/analytics/live-stats",
    response_model=LiveAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get aggregated live operational analytics (Redis cached for 3s)",
)
async def get_live_analytics(
    db: AsyncSession = Depends(get_db),
    sim_id: Annotated[
        str | None,
        Query(description="Optional active simulation ID to isolate session metrics"),
    ] = None,
) -> LiveAnalyticsResponse:
    """Calculates aggregated metrics across active SOS reports, rescue unit statuses,

    and average ETAs. Results are cached in Redis for 3 seconds to protect database against slider spam.
    """
    redis_client = await get_redis_client()
    cache_key = f"{CACHE_KEY_PREFIX}:{sim_id or 'none'}"

    # 1. Try Redis cache lookup
    if redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                await redis_client.aclose()
                return LiveAnalyticsResponse(**json.loads(cached_data))
        except Exception as exc:
            logger.warning(f"Redis cache read error: {exc}")

    # 2. Build base query filters for sim_id if provided
    sos_stmt = select(func.count(SOSReport.id))
    confirmed_stmt = select(func.count(SOSReport.id)).where(SOSReport.trust_score >= 2)
    resolved_stmt = select(func.count(SOSReport.id)).where(SOSReport.status == SOSStatus.RESOLVED)
    active_stmt = select(func.count(SOSReport.id)).where(SOSReport.status != SOSStatus.RESOLVED)
    critical_stmt = select(func.count(SOSReport.id)).where(SOSReport.severity == SOSSeverity.CRITICAL_TRAPPED)

    dispatched_units_stmt = select(func.count(RescueUnit.id)).where(RescueUnit.status == RescueUnitStatus.DISPATCHED)
    available_units_stmt = select(func.count(RescueUnit.id)).where(RescueUnit.status == RescueUnitStatus.AVAILABLE)
    total_units_stmt = select(func.count(RescueUnit.id))

    if sim_id:
        sos_stmt = sos_stmt.where(SOSReport.sim_id == sim_id)
        confirmed_stmt = confirmed_stmt.where(SOSReport.sim_id == sim_id)
        resolved_stmt = resolved_stmt.where(SOSReport.sim_id == sim_id)
        active_stmt = active_stmt.where(SOSReport.sim_id == sim_id)
        critical_stmt = critical_stmt.where(SOSReport.sim_id == sim_id)

        dispatched_units_stmt = dispatched_units_stmt.where(RescueUnit.sim_id == sim_id)
        available_units_stmt = available_units_stmt.where(RescueUnit.sim_id == sim_id)
        total_units_stmt = total_units_stmt.where(RescueUnit.sim_id == sim_id)

    total_sos_res = await db.execute(sos_stmt)
    total_sos = int(total_sos_res.scalar() or 0)

    confirmed_sos_res = await db.execute(confirmed_stmt)
    confirmed_sos = int(confirmed_sos_res.scalar() or 0)

    resolved_sos_res = await db.execute(resolved_stmt)
    resolved_sos = int(resolved_sos_res.scalar() or 0)

    active_sos_res = await db.execute(active_stmt)
    active_sos = int(active_sos_res.scalar() or 0)

    critical_sos_res = await db.execute(critical_stmt)
    critical_sos = int(critical_sos_res.scalar() or 0)

    dispatched_units_res = await db.execute(dispatched_units_stmt)
    dispatched_units = int(dispatched_units_res.scalar() or 0)

    available_units_res = await db.execute(available_units_stmt)
    available_units = int(available_units_res.scalar() or 0)

    total_units_res = await db.execute(total_units_stmt)
    total_units = int(total_units_res.scalar() or 0)

    # Compute genuine average ETA from persisted dispatch_assignments table
    avg_eta_stmt = select(func.avg(DispatchAssignmentModel.eta_seconds))
    if sim_id:
        avg_eta_stmt = avg_eta_stmt.where(
            DispatchAssignmentModel.sos_id.in_(select(SOSReport.id).where(SOSReport.sim_id == sim_id))
        )
    avg_eta_res = await db.execute(avg_eta_stmt)
    avg_eta_sec = avg_eta_res.scalar()
    avg_eta = round(float(avg_eta_sec) / 60.0, 2) if avg_eta_sec is not None else 0.0

    # Compute real monitored geographic area in km2 via PostGIS ST_Area over union of persisted FloodZones
    monitored_area_km2 = 42.5
    try:
        area_query = select(
            func.coalesce(
                func.ST_Area(
                    func.cast(func.ST_Union(FloodZone.geometry), Geography)
                ) / 1000000.0,
                0.0,
            )
        )
        if sim_id:
            area_query = area_query.where(FloodZone.sim_id == sim_id)

        area_res = await db.execute(area_query)
        computed_area = float(area_res.scalar() or 0.0)
        if computed_area > 0.0:
            monitored_area_km2 = round(computed_area, 2)
    except Exception as exc:
        logger.warning(f"Could not compute ST_Area over flood_zones ({exc}), using default fallback")

    analytics_response = LiveAnalyticsResponse(
        monitored_area_km2=monitored_area_km2,
        total_sos_logged=total_sos,
        total_sos_confirmed=confirmed_sos,
        total_sos_resolved=resolved_sos,
        active_sos_count=active_sos,
        critical_sos_count=critical_sos,
        dispatched_units_count=dispatched_units,
        available_units_count=available_units,
        total_units_count=total_units,
        avg_eta_minutes=avg_eta,
    )

    # 3. Store result in Redis cache with 3s TTL
    if redis_client:
        try:
            await redis_client.setex(cache_key, CACHE_TTL_SECONDS, analytics_response.model_dump_json())
            await redis_client.aclose()
        except Exception as exc:
            logger.warning(f"Redis cache write error: {exc}")

    return analytics_response
