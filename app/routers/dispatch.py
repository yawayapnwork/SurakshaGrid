from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_officer
from app.db.session import get_db
from app.schemas.dispatch import DispatchAssignment
from app.services.dispatch_optimizer import optimize_rescue_dispatch

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
    officer: dict = Depends(get_current_officer),
) -> list[DispatchAssignment]:
    """Optimizes dispatch matching between available rescue units and pending SOS reports."""
    assignments = await optimize_rescue_dispatch(db)
    return assignments

