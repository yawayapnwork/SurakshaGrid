from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.flood_zone import FloodZone
from app.routers.simulation import build_flood_zone_polygon

router = APIRouter(tags=["flood-zones"])


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
) -> dict:
    """Reads the latest persisted flood zone polygon for an active sim_id or rainfall intensity,
    or falls back to generating the matching polygon buffer representation.
    """
    # 1. Try fetching latest persisted FloodZone record for sim_id
    if sim_id:
        stmt = select(FloodZone).where(FloodZone.sim_id == sim_id).order_by(FloodZone.created_at.desc())
        res = await db.execute(stmt)
        latest_zone = res.scalars().first()
        if latest_zone:
            try:
                shape = to_shape(latest_zone.geometry)
                coords = [[[round(pt[0], 6), round(pt[1], 6)] for pt in shape.exterior.coords]]
                return {
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
            except Exception:
                pass

    # 2. Fall back to shared polygon calculation formula
    _, geojson_geom = build_flood_zone_polygon(rainfall)
    buffer_deg = 0.01 + (min(max(rainfall, 0.0), 100.0) / 100.0) * 0.05

    return {
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

