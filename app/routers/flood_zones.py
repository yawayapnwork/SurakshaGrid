from typing import Annotated

from fastapi import APIRouter, Query, status

router = APIRouter(tags=["flood-zones"])


@router.get(
    "/flood-zones/simulate",
    status_code=status.HTTP_200_OK,
    summary="Simulate what-if flood zone extent polygon based on rainfall intensity",
)
async def simulate_flood_zones(
    rainfall: Annotated[
        float,
        Query(
            description="Simulated rainfall intensity (0 to 100)",
            ge=0.0,
            le=100.0,
        ),
    ] = 0.0,
) -> dict:
    """Computes a lightweight simulated flood inundation polygon buffer around the

    water corridor line y = 13.05 + 0.5 * (x - 80.25) scaling with rainfall intensity.
    Returns a GeoJSON FeatureCollection.
    """
    rainfall_norm = min(max(rainfall, 0.0), 100.0)
    buffer_deg = 0.01 + (rainfall_norm / 100.0) * 0.05

    # Water corridor line segment endpoints (Chennai region bounds)
    x1, y1 = 80.15, 13.00
    x2, y2 = 80.35, 13.10

    # Line segment vector and unit perpendicular normal (-dy, dx) / length
    dx = x2 - x1
    dy = y2 - y1
    length = (dx * dx + dy * dy) ** 0.5

    nx = -dy / length
    ny = dx / length

    # Construct buffered polygon ring coordinates (closed loop)
    p1 = [round(x1 + nx * buffer_deg, 6), round(y1 + ny * buffer_deg, 6)]
    p2 = [round(x2 + nx * buffer_deg, 6), round(y2 + ny * buffer_deg, 6)]
    p3 = [round(x2 - nx * buffer_deg, 6), round(y2 - ny * buffer_deg, 6)]
    p4 = [round(x1 - nx * buffer_deg, 6), round(y1 - ny * buffer_deg, 6)]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[p1, p2, p3, p4, p1]],
                },
                "properties": {
                    "rainfall": round(rainfall_norm, 2),
                    "buffer_degrees": round(buffer_deg, 6),
                },
            }
        ],
    }
