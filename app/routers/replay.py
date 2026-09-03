from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import String, cast, func, or_, select
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
    event_id: Annotated[
        Optional[str],
        Query(description="Optional event ID or associated SOS ID filter"),
    ] = None,
    sim_id: Annotated[
        Optional[str],
        Query(description="Optional simulation ID filter"),
    ] = None,
    since: Annotated[
        Optional[datetime],
        Query(description="Optional ISO 8601 timestamp filter to retrieve events occurred since this time"),
    ] = None,
    until: Annotated[
        Optional[datetime],
        Query(description="Optional ISO 8601 timestamp filter to retrieve events occurred up to this time"),
    ] = None,
    event_types: Annotated[
        Optional[list[str]],
        Query(description="Optional list of event types to filter by"),
    ] = None,
    limit: Annotated[
        Optional[int],
        Query(ge=1, le=1000, description="Max number of events to return"),
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> list[EventLogRead]:
    """Retrieves chronological rows from event_log for digital twin incident reconstruction."""
    stmt = select(EventLog)

    if sim_id:
        stmt = stmt.where(func.jsonb_extract_path_text(EventLog.payload, "sim_id") == sim_id)

    if event_id:
        stmt = stmt.where(
            or_(
                cast(EventLog.id, String) == event_id,
                func.jsonb_extract_path_text(EventLog.payload, "event_id") == event_id,
                func.jsonb_extract_path_text(EventLog.payload, "sos_id") == event_id,
            )
        )

    if since is not None:
        stmt = stmt.where(EventLog.occurred_at >= since)

    if until is not None:
        stmt = stmt.where(EventLog.occurred_at <= until)

    if event_types:
        stmt = stmt.where(EventLog.event_type.in_(event_types))

    stmt = stmt.order_by(EventLog.occurred_at.asc())

    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    events = list(result.scalars().all())

    return [EventLogRead.model_validate(event) for event in events]

