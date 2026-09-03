from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.event_log import EventLog
from app.schemas.event_log import EventLogRead

router = APIRouter(tags=["replay"])


@router.get(
    "/replay",
    response_model=list[EventLogRead],
    status_code=status.HTTP_200_OK,
    summary="Retrieve chronological event log timeline for digital twin incident replay",
)
async def get_replay_events(
    since: Annotated[
        datetime | None,
        Query(
            description="Optional ISO 8601 timestamp filter to retrieve events occurred since this time"
        ),
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> list[EventLogRead]:
    """Retrieves chronological rows from event_log for digital twin incident reconstruction."""
    stmt = select(EventLog)
    if since is not None:
        stmt = stmt.where(EventLog.occurred_at >= since)

    stmt = stmt.order_by(EventLog.occurred_at.asc())

    result = await db.execute(stmt)
    events = list(result.scalars().all())

    return [EventLogRead.model_validate(event) for event in events]
