import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_officer
from app.db.session import get_db
from app.schemas.dispatch import DispatchAssignment
from app.services.dispatch_optimizer import optimize_rescue_dispatch

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

