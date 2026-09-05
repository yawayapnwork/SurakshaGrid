"""Location-aware live rainfall lookup.

The rainfall feed has two sources, tried in order:
  1. The most recent n8n-ingested `LiveRainfallReading` within range of the requested
     location (POST /api/v1/risk-scores/live-rainfall persists readings with lat/lon).
  2. A direct OpenWeatherMap call for that exact location, if OPENWEATHER_API_KEY is
     configured — so a region n8n hasn't pushed a reading for yet still gets a real,
     location-correct value instead of silently reusing whatever the last reading
     anywhere on Earth happened to be.

Readings/API calls are never trusted blindly: age and distance thresholds mean a stale or
far-away reading is treated as "none available" rather than misrepresented as local.
"""

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.live_rainfall_reading import LiveRainfallReading
from app.services.dispatch_optimizer import haversine_distance_meters

logger = logging.getLogger(__name__)

# A reading further than this from the requested point isn't "this region's weather".
MAX_READING_DISTANCE_METERS = 50_000.0  # 50km
# A reading older than this is stale regardless of distance.
MAX_READING_AGE_SECONDS = 60 * 60  # 1 hour

OPENWEATHER_API_BASE = "https://api.openweathermap.org/data/2.5/weather"


async def find_nearest_recent_reading(
    db: AsyncSession,
    latitude: float | None,
    longitude: float | None,
    max_distance_meters: float = MAX_READING_DISTANCE_METERS,
    max_age_seconds: float = MAX_READING_AGE_SECONDS,
) -> LiveRainfallReading | None:
    """Returns the most recent ingested reading within range of (latitude, longitude),

    or the single most recent reading of any location if no coordinates are given (the
    pre-geolocation behavior, kept as the ultimate fallback for callers that don't pass
    a location at all). Readings outside `max_distance_meters` or older than
    `max_age_seconds` are treated as unavailable rather than misrepresented as current.
    """
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)

    if latitude is None or longitude is None:
        stmt = (
            select(LiveRainfallReading)
            .where(LiveRainfallReading.timestamp >= cutoff)
            .order_by(LiveRainfallReading.timestamp.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    # Pull a bounded window of recent, geotagged readings and rank by actual distance in
    # Python — the reading volume here is small (one row per n8n cron tick), so this
    # avoids needing PostGIS geography columns just for two nullable floats.
    stmt = (
        select(LiveRainfallReading)
        .where(
            LiveRainfallReading.timestamp >= cutoff,
            LiveRainfallReading.latitude.is_not(None),
            LiveRainfallReading.longitude.is_not(None),
        )
        .order_by(LiveRainfallReading.timestamp.desc())
        .limit(200)
    )
    result = await db.execute(stmt)
    candidates = list(result.scalars().all())

    best: LiveRainfallReading | None = None
    best_distance = float("inf")
    for reading in candidates:
        distance = haversine_distance_meters(latitude, longitude, reading.latitude, reading.longitude)
        if distance <= max_distance_meters and distance < best_distance:
            best = reading
            best_distance = distance

    return best


def _rainfall_mm_to_intensity(raw_mm_per_hour: float) -> float:
    """Maps mm/hour of rainfall to this app's 0-100 intensity scale used everywhere else

    (risk formula, flood zone buffer sizing). 20mm/hr ("very heavy rain" by IMD
    classification) saturates the scale.
    """
    return round(min(max(raw_mm_per_hour, 0.0), 20.0) / 20.0 * 100.0, 2)


async def fetch_live_rainfall_from_provider(latitude: float, longitude: float) -> tuple[float, float] | None:
    """Calls OpenWeatherMap's Current Weather API directly for (latitude, longitude).

    Returns (rainfall_intensity, raw_mm) on success, or None if OPENWEATHER_API_KEY isn't
    configured, the request fails, or the response can't be parsed — callers fall back to
    whatever ingested reading (if any) they already have.
    """
    settings = get_settings()
    if not settings.OPENWEATHER_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(
                OPENWEATHER_API_BASE,
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "appid": settings.OPENWEATHER_API_KEY,
                    "units": "metric",
                },
            )
        if response.status_code != 200:
            logger.warning(f"OpenWeatherMap returned HTTP {response.status_code} for ({latitude}, {longitude})")
            return None

        data = response.json()
        raw_mm = float(data.get("rain", {}).get("1h", 0.0))
        return (_rainfall_mm_to_intensity(raw_mm), raw_mm)
    except Exception as exc:
        logger.warning(f"Failed to fetch live rainfall from OpenWeatherMap for ({latitude}, {longitude}): {exc}")
        return None
