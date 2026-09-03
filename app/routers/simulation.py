import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_officer
from app.db.session import AsyncSessionLocal, get_db
from app.models.enums import RescueUnitStatus, RescueUnitType, SOSSeverity, SOSStatus
from app.models.event_log import EventLog
from app.models.rescue_unit import RescueUnit
from app.models.sos_confirmation import SOSConfirmation
from app.models.sos_report import SOSReport
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["simulation"])

# Module-level active simulation run tracker for cancellation on scenario reset
_active_sim_id: str | None = None


async def reset_demo_state(db: AsyncSession) -> None:
    """Safely resets demo tables in PostgreSQL while preserving schema."""
    global _active_sim_id
    _active_sim_id = None  # Cancel any ongoing background staggered simulation

    await db.execute(delete(SOSConfirmation))
    await db.execute(delete(SOSReport))
    await db.execute(delete(RescueUnit))

    # Log reset event
    event = EventLog(
        event_type="SCENARIO_RESET",
        payload={"reset_at": datetime.now(timezone.utc).isoformat()},
    )
    db.add(event)
    await db.commit()

    # Broadcast reset to all connected WebSocket clients
    await ws_manager.publish("SCENARIO_RESET", {"status": "cleared"})


async def run_staggered_simulation(sim_id: str) -> None:
    """Background task that progressively inserts and broadcasts SOS reports with real staggered timing.

    Uses AsyncSessionLocal to obtain dedicated non-request DB sessions.
    """
    global _active_sim_id

    # 12 Realistic SOS Reports with staggered delays (in seconds)
    sos_reports_data = [
        # (lon, lat, severity, photo_url, visual_confidence, trust_score, transcript, delay_seconds, add_confirmation)
        (
            80.2715,
            13.0835,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800",
            0.94,
            5,
            "पानी बहुत तेज़ी से बढ़ रहा है, पहली मंज़िल पर फँसे हैं! तुरंत नाव भेजें!",
            0,
            True,
        ),
        (
            80.2250,
            13.0450,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800",
            0.89,
            4,
            "Water entering house rapidly near Velachery main road, 4 people trapped on terrace!",
            4,
            True,
        ),
        (
            80.2420,
            13.0550,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800",
            0.91,
            3,
            "जलभराव के कारण बुजुर्ग महिला बीमार हैं, तत्काल एम्बुलेंस की आवश्यकता है!",
            4,
            True,
        ),
        (
            80.2620,
            13.0910,
            SOSSeverity.HIGH,
            None,
            None,
            3,
            "Rooftop evacuation needed near river canal, 2 children stranded!",
            5,
            True,
        ),
        (
            80.2110,
            13.0180,
            SOSSeverity.HIGH,
            None,
            None,
            2,
            "बाढ़ का पानी कमर तक पहुँच चुका है, बिजली सप्लाई बंद हो गई है!",
            5,
            False,
        ),
        (
            80.2520,
            13.0720,
            SOSSeverity.HIGH,
            None,
            None,
            2,
            "Severe flooding near hospital entrance, medical supplies needed!",
            4,
            False,
        ),
        (
            80.2310,
            13.0320,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            "घुटनों तक पानी भरा है, पीने का पानी खत्म हो गया है!",
            5,
            False,
        ),
        (
            80.2780,
            13.0650,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            "Water level at 3 feet near commercial complex.",
            4,
            False,
        ),
        (
            80.2050,
            13.0250,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            None,
            5,
            False,
        ),
        (
            80.2450,
            13.1100,
            SOSSeverity.LOW,
            None,
            None,
            0,
            "Waterlogging on street road.",
            4,
            False,
        ),
        (
            80.2680,
            13.0780,
            SOSSeverity.LOW,
            None,
            None,
            0,
            None,
            5,
            False,
        ),
        (
            80.2180,
            13.0580,
            SOSSeverity.LOW,
            None,
            None,
            0,
            None,
            4,
            False,
        ),
    ]

    try:
        for lon, lat, sev, photo_url, conf, trust, transcript, delay_sec, add_conf in sos_reports_data:
            if _active_sim_id != sim_id:
                logger.info(f"Staggered simulation {sim_id} cancelled or superseded.")
                return

            if delay_sec > 0:
                await asyncio.sleep(delay_sec)

            if _active_sim_id != sim_id:
                logger.info(f"Staggered simulation {sim_id} cancelled or superseded during sleep.")
                return

            created_ts = datetime.now(timezone.utc)
            report_id = uuid.uuid4()
            location_wkt = f"SRID=4326;POINT({lon} {lat})"
            sev_str = sev.value if hasattr(sev, "value") else str(sev)

            conf_id = uuid.uuid4() if add_conf else None
            conf_time = created_ts + timedelta(seconds=1) if add_conf else None

            # Dedicated non-request session from AsyncSessionLocal
            async with AsyncSessionLocal() as task_db:
                report = SOSReport(
                    id=report_id,
                    location=location_wkt,
                    status=SOSStatus.PENDING,
                    severity=sev,
                    photo_url=photo_url,
                    visual_confidence_score=conf,
                    trust_score=trust,
                    voice_transcript=transcript,
                    created_at=created_ts,
                )
                task_db.add(report)
                await task_db.flush()

                event = EventLog(
                    event_type="SOS_CREATED",
                    payload={
                        "sos_id": str(report_id),
                        "latitude": lat,
                        "longitude": lon,
                        "severity": sev_str,
                        "photo_url": photo_url,
                        "visual_confidence_score": conf,
                        "trust_score": trust,
                        "voice_transcript": transcript,
                    },
                    occurred_at=created_ts,
                )
                task_db.add(event)

                if add_conf and conf_id and conf_time:
                    confirmation = SOSConfirmation(
                        id=conf_id,
                        sos_id=report.id,
                        confirmed_at=conf_time,
                    )
                    task_db.add(confirmation)
                    conf_event = EventLog(
                        event_type="SOS_CONFIRMED",
                        payload={
                            "sos_id": str(report.id),
                            "trust_score": trust,
                            "confirmation_id": str(conf_id),
                        },
                        occurred_at=conf_time,
                    )
                    task_db.add(conf_event)

                await task_db.commit()

            # Broadcast real-time WebSocket events
            await ws_manager.publish(
                "SOS_CREATED",
                {
                    "sos_id": str(report_id),
                    "location": {"type": "Point", "coordinates": [lon, lat]},
                    "severity": sev_str,
                    "status": SOSStatus.PENDING.value,
                    "photo_url": photo_url,
                    "visual_confidence_score": conf,
                    "trust_score": trust,
                    "voice_transcript": transcript,
                    "created_at": created_ts.isoformat(),
                },
            )

            if add_conf and conf_id:
                await ws_manager.publish(
                    "SOS_CONFIRMED",
                    {
                        "sos_id": str(report_id),
                        "trust_score": trust,
                        "severity": sev_str,
                        "status": SOSStatus.PENDING.value,
                        "confirmation_id": str(conf_id),
                    },
                )

        if _active_sim_id == sim_id:
            logger.info(f"Completed background staggered SOS simulation spawner {sim_id}.")
            await ws_manager.publish(
                "SIMULATION_COMPLETE",
                {
                    "sim_id": sim_id,
                    "status": "completed",
                    "total_reports_spawned": len(sos_reports_data),
                    "message": "Live flood scenario simulation completed. All SOS reports spawned.",
                },
            )
    finally:
        if _active_sim_id == sim_id:
            _active_sim_id = None


@router.post(
    "/simulation/reset",
    status_code=status.HTTP_200_OK,
    summary="Reset demo state and clear test SOS reports and units",
)
async def reset_simulation(
    db: AsyncSession = Depends(get_db),
    officer: dict = Depends(get_current_officer),
) -> dict[str, str]:
    """Clears all demo SOS reports and rescue units from PostgreSQL."""
    await reset_demo_state(db)
    return {"status": "success", "message": "Demo state reset successfully"}


@router.post(
    "/simulation/trigger",
    status_code=status.HTTP_200_OK,
    summary="Trigger live hackathon flood scenario generator",
)
async def trigger_simulation(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    officer: dict = Depends(get_current_officer),
) -> dict[str, str | int]:
    """Clears demo state, seeds 7 rescue units immediately, and schedules background staggered SOS report delivery."""
    global _active_sim_id

    # 1. Reset existing demo state
    await reset_demo_state(db)

    sim_id = str(uuid.uuid4())
    _active_sim_id = sim_id

    # 2. Seed 7 Rescue Units immediately
    rescue_units_data = [
        ("NDRF Rescue Boat Alpha", RescueUnitType.BOAT, "SRID=4326;POINT(80.2707 13.0827)"),
        ("SDRF Rescue Boat Beta", RescueUnitType.BOAT, "SRID=4326;POINT(80.2200 13.0400)"),
        ("Coast Guard Rescue Boat Gamma", RescueUnitType.BOAT, "SRID=4326;POINT(80.2800 13.0600)"),
        ("108 Emergency Ambulance Alpha", RescueUnitType.AMBULANCE, "SRID=4326;POINT(80.2000 13.0100)"),
        ("Medical Relief Ambulance Bravo", RescueUnitType.AMBULANCE, "SRID=4326;POINT(80.2500 13.1000)"),
        ("SkyEye Recon Drone One", RescueUnitType.DRONE, "SRID=4326;POINT(80.2400 13.0500)"),
        ("AeroSurveillance Drone Two", RescueUnitType.DRONE, "SRID=4326;POINT(80.2600 13.0900)"),
    ]

    seeded_units: list[RescueUnit] = []
    for name, u_type, loc_wkt in rescue_units_data:
        unit = RescueUnit(
            id=uuid.uuid4(),
            name=name,
            unit_type=u_type,
            current_location=loc_wkt,
            status=RescueUnitStatus.AVAILABLE,
        )
        db.add(unit)
        seeded_units.append(unit)

    await db.commit()

    # 3. Schedule background staggered SOS spawner with dedicated AsyncSessionLocal session management
    background_tasks.add_task(run_staggered_simulation, sim_id)

    logger.info(f"Triggered live simulation: seeded {len(seeded_units)} units immediately. Spawning SOS reports progressively.")

    return {
        "status": "started",
        "seeded_units": len(seeded_units),
        "message": "Live flood scenario initiated. SOS reports will arrive progressively.",
    }


