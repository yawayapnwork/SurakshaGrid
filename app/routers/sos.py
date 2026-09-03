import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.rate_limiter import check_sos_rate_limit
from app.db.session import get_db
from app.models.enums import SOSSeverity, SOSStatus
from app.models.event_log import EventLog
from app.models.sos_confirmation import SOSConfirmation
from app.models.sos_report import SOSReport
from app.schemas.sos_confirmation import SOSConfirmationRead
from app.schemas.sos_report import SOSReportRead
from app.services.cloudinary_service import upload_image_to_cloudinary
from app.services.cv_service import estimate_water_confidence
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["sos"])


@router.post(
    "/sos",
    response_model=SOSReportRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(check_sos_rate_limit)],
    summary="Submit a citizen SOS flood report",
)
async def create_sos_report(
    latitude: Annotated[float, Form(description="Latitude in decimal degrees")],
    longitude: Annotated[float, Form(description="Longitude in decimal degrees")],
    severity: Annotated[SOSSeverity, Form(description="Severity level of the emergency")],
    voice_transcript: Annotated[str | None, Form(description="Optional voice transcript")] = None,
    image: Annotated[UploadFile | None, File(description="Optional uploaded photo evidence")] = None,
    db: AsyncSession = Depends(get_db),
) -> SOSReportRead:
    """Accepts citizen SOS multipart form data, executes OpenCV water verification in a thread pool,

    uploads photo to Cloudinary, persists the report to PostGIS DB, logs an event, and broadcasts state.
    """
    if not (-90.0 <= latitude <= 90.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Latitude must be between -90.0 and 90.0",
        )
    if not (-180.0 <= longitude <= 180.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Longitude must be between -180.0 and 180.0",
        )

    photo_url: str | None = None
    visual_confidence_score: float | None = None

    if image is not None:
        image_bytes = await image.read()
        if image_bytes and len(image_bytes) > 0:
            # OpenCV blocking heuristic executed via thread pool
            visual_confidence_score = await run_in_threadpool(
                estimate_water_confidence, image_bytes
            )
            # Cloudinary upload executed asynchronously via thread pool
            photo_url = await upload_image_to_cloudinary(
                image_bytes, filename=image.filename or "sos.jpg"
            )

    # PostGIS Point string in WGS84 (SRID 4326)
    location_wkt = f"SRID=4326;POINT({longitude} {latitude})"

    report = SOSReport(
        id=uuid.uuid4(),
        location=location_wkt,
        status=SOSStatus.PENDING,
        severity=severity,
        photo_url=photo_url,
        visual_confidence_score=visual_confidence_score,
        trust_score=0,
        voice_transcript=voice_transcript,
    )
    db.add(report)
    await db.flush()

    severity_str = severity.value if isinstance(severity, SOSSeverity) else str(severity)

    # Log SOS_CREATED event in event_log table
    event = EventLog(
        event_type="SOS_CREATED",
        payload={
            "sos_id": str(report.id),
            "latitude": latitude,
            "longitude": longitude,
            "severity": severity_str,
            "photo_url": report.photo_url,
            "visual_confidence_score": report.visual_confidence_score,
            "trust_score": report.trust_score,
            "voice_transcript": report.voice_transcript,
        },
    )
    db.add(event)
    await db.commit()
    await db.refresh(report)

    if report.created_at is None:
        from datetime import datetime, timezone
        report.created_at = datetime.now(timezone.utc)

    status_str = report.status.value if isinstance(report.status, SOSStatus) else str(report.status)

    # Broadcast event via Real-Time WebSocket Channel / Redis PubSub
    await ws_manager.publish(
        "SOS_CREATED",
        {
            "sos_id": str(report.id),
            "location": {"type": "Point", "coordinates": [longitude, latitude]},
            "severity": severity_str,
            "status": status_str,
            "photo_url": report.photo_url,
            "visual_confidence_score": report.visual_confidence_score,
            "trust_score": report.trust_score,
            "voice_transcript": report.voice_transcript,
            "created_at": report.created_at.isoformat() if report.created_at else None,
        },
    )

    return SOSReportRead.model_validate(report)


@router.post(
    "/sos/{id}/confirm",
    response_model=SOSConfirmationRead,
    status_code=status.HTTP_200_OK,
    summary="Confirm an existing SOS report",
)
async def confirm_sos_report(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SOSConfirmationRead:
    """Increments trust_score for an SOS report, records a confirmation entry, logs event, and broadcasts update."""
    result = await db.execute(select(SOSReport).where(SOSReport.id == id))
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SOS report with id '{id}' not found",
        )

    # Increment trust_score
    report.trust_score += 1

    # Record entry in sos_confirmations
    confirmation = SOSConfirmation(
        id=uuid.uuid4(),
        sos_id=report.id,
    )
    db.add(confirmation)
    await db.flush()

    severity_str = report.severity.value if isinstance(report.severity, SOSSeverity) else str(report.severity)
    status_str = report.status.value if isinstance(report.status, SOSStatus) else str(report.status)

    # Log SOS_CONFIRMED event in event_log table
    event = EventLog(
        event_type="SOS_CONFIRMED",
        payload={
            "sos_id": str(report.id),
            "trust_score": report.trust_score,
            "confirmation_id": str(confirmation.id),
        },
    )
    db.add(event)
    await db.commit()
    await db.refresh(confirmation)
    await db.refresh(report)

    if confirmation.confirmed_at is None:
        from datetime import datetime, timezone
        confirmation.confirmed_at = datetime.now(timezone.utc)

    # Broadcast state mutation (urgency shift) to connected clients
    await ws_manager.publish(
        "SOS_CONFIRMED",
        {
            "sos_id": str(report.id),
            "trust_score": report.trust_score,
            "severity": severity_str,
            "status": status_str,
            "confirmation_id": str(confirmation.id),
        },
    )

    return SOSConfirmationRead.model_validate(confirmation)


@router.get(
    "/sos/nearby",
    response_model=list[SOSReportRead],
    status_code=status.HTTP_200_OK,
    summary="Query nearby active SOS reports using PostGIS ST_DWithin spatial index filter",
)
async def get_nearby_sos_reports(
    latitude: float,
    longitude: float,
    radius_meters: float = 5000.0,
    db: AsyncSession = Depends(get_db),
) -> list[SOSReportRead]:
    """Queries active SOS reports within radius_meters of a coordinate using PostGIS ST_DWithin spatial index filter."""
    try:
        from sqlalchemy import cast, func
        from geoalchemy2 import Geography
        point_geog = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)
        stmt = select(SOSReport).where(
            func.ST_DWithin(
                cast(SOSReport.location, Geography),
                cast(point_geog, Geography),
                radius_meters,
            )
        )
        result = await db.execute(stmt)
        reports = list(result.scalars().all())
        return [SOSReportRead.model_validate(r) for r in reports]
    except Exception:
        # Fallback to fetching all and filtering by Haversine if non-PostGIS test DB
        from app.services.dispatch_optimizer import extract_coordinates, haversine_distance_meters
        result = await db.execute(select(SOSReport))
        reports = list(result.scalars().all())
        nearby = []
        for r in reports:
            r_lon, r_lat = extract_coordinates(r.location)
            if haversine_distance_meters(latitude, longitude, r_lat, r_lon) <= radius_meters:
                nearby.append(SOSReportRead.model_validate(r))
        return nearby
