import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_officer
from app.db.session import get_db
from app.models.rescue_unit import RescueUnit
from app.models.sos_report import SOSReport
from app.schemas.dispatch import DispatchAssignment
from app.schemas.dispatch_route import DispatchRouteResult
from app.services.dispatch_optimizer import extract_coordinates, optimize_rescue_dispatch
from app.services.route_service import RouteUnavailableError, fetch_route

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dispatch"])


@router.post(
    "/dispatch/optimize",
    response_model=list[DispatchAssignment],
    status_code=status.HTTP_200_OK,
    summary="Trigger Hungarian-algorithm optimal rescue unit dispatch assignment",
)
@router.post(
    "/dispatch/run",
    response_model=list[DispatchAssignment],
    status_code=status.HTTP_200_OK,
    summary="Alias trigger for Hungarian-algorithm optimal rescue unit dispatch assignment",
)
async def run_rescue_dispatch(
    db: AsyncSession = Depends(get_db),
    sim_id: Annotated[
        str | None,
        Query(description="Optional active simulation ID to isolate dispatch scope"),
    ] = None,
    officer: dict = Depends(get_current_officer),
) -> list[DispatchAssignment]:
    """Optimizes dispatch matching between available rescue units and pending SOS reports."""
    try:
        return await optimize_rescue_dispatch(db, sim_id=sim_id)
    except ValueError as exc:
        # Raised deliberately by the optimizer for a malformed cost matrix (e.g. NaN/Inf
        # from an upstream duration source) — a client-actionable 422, not a server bug.
        logger.warning(f"Dispatch optimizer rejected invalid input (sim_id={sim_id}): {exc}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - normalize any computation failure to a clean JSON error
        logger.exception(f"Dispatch optimizer failed unexpectedly (sim_id={sim_id}): {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute rescue dispatch assignments. Please try again.",
        ) from exc


@router.get(
    "/dispatch/route",
    response_model=DispatchRouteResult,
    status_code=status.HTTP_200_OK,
    summary="Get the turn-by-turn OSRM driving route from a rescue unit to its assigned SOS incident",
)
async def get_dispatch_route(
    rescue_unit_id: Annotated[uuid.UUID, Query(description="Dispatched rescue unit's id")],
    sos_id: Annotated[uuid.UUID, Query(description="Assigned SOS report's id")],
    db: AsyncSession = Depends(get_db),
) -> DispatchRouteResult:
    """Fetches real road geometry + turn-by-turn steps from OSRM between a rescue unit's

    current position and its assigned incident, for rendering an actual route polyline
    and navigation card instead of the straight assignment line drawn on the overview map.
    """
    unit = await db.get(RescueUnit, rescue_unit_id)
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Rescue unit '{rescue_unit_id}' not found")

    report = await db.get(SOSReport, sos_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SOS report '{sos_id}' not found")

    try:
        origin = extract_coordinates(unit.current_location)
        destination = extract_coordinates(report.location)
        route = await fetch_route(origin, destination)
    except RouteUnavailableError as exc:
        logger.warning(f"Route unavailable for unit={rescue_unit_id} sos={sos_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Live routing is temporarily unavailable. Showing a direct line instead.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - normalize any unexpected failure to a clean JSON error
        logger.exception(f"Failed to fetch route for unit={rescue_unit_id} sos={sos_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute the route. Please try again.",
        ) from exc

    return DispatchRouteResult(**route)

