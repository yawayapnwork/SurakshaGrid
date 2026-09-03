from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthResponse)
async def healthz(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar_one()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connectivity check failed",
        ) from exc

    return HealthResponse(status="ok", database="up")
