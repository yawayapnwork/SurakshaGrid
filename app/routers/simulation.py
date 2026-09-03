import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.enums import RescueUnitStatus, RescueUnitType, SOSSeverity, SOSStatus
from app.models.event_log import EventLog
from app.models.rescue_unit import RescueUnit
from app.models.sos_confirmation import SOSConfirmation
from app.models.sos_report import SOSReport
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["simulation"])


async def reset_demo_state(db: AsyncSession) -> None:
    """Safely resets demo tables in PostgreSQL while preserving schema."""
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


@router.post(
    "/simulation/reset",
    status_code=status.HTTP_200_OK,
    summary="Reset demo state and clear test SOS reports and units",
)
async def reset_simulation(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Clears all demo SOS reports and rescue units from PostgreSQL."""
    await reset_demo_state(db)
    return {"status": "success", "message": "Demo state reset successfully"}


@router.post(
    "/simulation/trigger",
    status_code=status.HTTP_200_OK,
    summary="Trigger live hackathon flood scenario generator",
)
async def trigger_simulation(
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    """Clears demo state, seeds 7 rescue units, generates 12 realistic SOS reports with staggered timestamps

    (demonstrating Yellow, Orange, and Pulsing Red radar ping urgency escalation states),
    and broadcasts real-time WebSocket events.
    """
    # 1. Reset existing demo state
    await reset_demo_state(db)

    now = datetime.now(timezone.utc)

    # 2. Seed 7 Rescue Units
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

    # 3. Seed 12 Realistic SOS Reports with Staggered Timestamps
    sos_reports_data = [
        # CRITICAL_TRAPPED with Photos, Hindi/English Transcripts & Aged Timestamps (>5m -> Pulsing Red Radar Ping)
        (
            80.2715,
            13.0835,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800",
            0.94,
            5,
            "पानी बहुत तेज़ी से बढ़ रहा है, पहली मंज़िल पर फँसे हैं! तुरंत नाव भेजें!",
            now - timedelta(minutes=6, seconds=15),
        ),
        (
            80.2250,
            13.0450,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800",
            0.89,
            4,
            "Water entering house rapidly near Velachery main road, 4 people trapped on terrace!",
            now - timedelta(minutes=4, seconds=30),
        ),
        (
            80.2420,
            13.0550,
            SOSSeverity.CRITICAL_TRAPPED,
            "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800",
            0.91,
            3,
            "जलभराव के कारण बुजुर्ग महिला बीमार हैं, तत्काल एम्बुलेंस की आवश्यकता है!",
            now - timedelta(minutes=1, seconds=20),
        ),
        # HIGH Severity (Aged & Moderate)
        (
            80.2620,
            13.0910,
            SOSSeverity.HIGH,
            None,
            None,
            3,
            "Rooftop evacuation needed near river canal, 2 children stranded!",
            now - timedelta(minutes=5, seconds=45),
        ),
        (
            80.2110,
            13.0180,
            SOSSeverity.HIGH,
            None,
            None,
            2,
            "बाढ़ का पानी कमर तक पहुँच चुका है, बिजली सप्लाई बंद हो गई है!",
            now - timedelta(minutes=3, seconds=10),
        ),
        (
            80.2520,
            13.0720,
            SOSSeverity.HIGH,
            None,
            None,
            2,
            "Severe flooding near hospital entrance, medical supplies needed!",
            now - timedelta(minutes=1, seconds=40),
        ),
        # MEDIUM Severity (Staggered 2-4m)
        (
            80.2310,
            13.0320,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            "घुटनों तक पानी भरा है, पीने का पानी खत्म हो गया है!",
            now - timedelta(minutes=3, seconds=50),
        ),
        (
            80.2780,
            13.0650,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            "Water level at 3 feet near commercial complex.",
            now - timedelta(minutes=1, seconds=10),
        ),
        (
            80.2050,
            13.0250,
            SOSSeverity.MEDIUM,
            None,
            None,
            1,
            None,
            now - timedelta(seconds=40),
        ),
        # LOW Severity (Recent <2m -> Yellow)
        (
            80.2450,
            13.1100,
            SOSSeverity.LOW,
            None,
            None,
            0,
            "Waterlogging on street road.",
            now - timedelta(minutes=2, seconds=15),
        ),
        (
            80.2680,
            13.0780,
            SOSSeverity.LOW,
            None,
            None,
            0,
            None,
            now - timedelta(minutes=1, seconds=0),
        ),
        (
            80.2180,
            13.0580,
            SOSSeverity.LOW,
            None,
            None,
            0,
            None,
            now - timedelta(seconds=15),
        ),
    ]

    seeded_reports: list[SOSReport] = []

    for lon, lat, sev, photo_url, conf, trust, transcript, created_ts in sos_reports_data:
        report_id = uuid.uuid4()
        location_wkt = f"SRID=4326;POINT({lon} {lat})"

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
        db.add(report)
        seeded_reports.append(report)

        # Log event in event_log table
        sev_str = sev.value if hasattr(sev, "value") else str(sev)
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
        db.add(event)

    # Commit all seeded DB entries
    await db.commit()

    # 4. Generate Synthetic Crowd Verification Confirmations (3 to 5 confirmations for high-severity reports)
    high_urgency_reports = [
        r for r in seeded_reports
        if r.severity in (SOSSeverity.CRITICAL_TRAPPED, SOSSeverity.HIGH)
    ]
    # Generate 4 synthetic confirmations across the high-urgency reports
    seeded_confirmations: list[SOSConfirmation] = []
    for idx, report in enumerate(high_urgency_reports[:4]):
        report.trust_score += 1
        conf_id = uuid.uuid4()
        conf_time = report.created_at + timedelta(minutes=1)

        confirmation = SOSConfirmation(
            id=conf_id,
            sos_id=report.id,
            confirmed_at=conf_time,
        )
        db.add(confirmation)
        seeded_confirmations.append(confirmation)

        sev_str = report.severity.value if hasattr(report.severity, "value") else str(report.severity)
        conf_event = EventLog(
            event_type="SOS_CONFIRMED",
            payload={
                "sos_id": str(report.id),
                "trust_score": report.trust_score,
                "confirmation_id": str(conf_id),
            },
            occurred_at=conf_time,
        )
        db.add(conf_event)

    await db.commit()

    # 5. Broadcast created reports & crowd confirmations via WebSocket
    for report in seeded_reports:
        clean_wkt = str(report.location).split(";")[-1].replace("POINT(", "").replace(")", "").strip()
        parts = clean_wkt.split()
        lon_val, lat_val = float(parts[0]), float(parts[1])
        sev_str = report.severity.value if hasattr(report.severity, "value") else str(report.severity)

        await ws_manager.publish(
            "SOS_CREATED",
            {
                "sos_id": str(report.id),
                "location": {"type": "Point", "coordinates": [lon_val, lat_val]},
                "severity": sev_str,
                "status": SOSStatus.PENDING.value,
                "photo_url": report.photo_url,
                "visual_confidence_score": report.visual_confidence_score,
                "trust_score": report.trust_score,
                "voice_transcript": report.voice_transcript,
                "created_at": report.created_at.isoformat(),
            },
        )

    for conf in seeded_confirmations:
        target_report = next((r for r in seeded_reports if r.id == conf.sos_id), None)
        if target_report:
            sev_str = target_report.severity.value if hasattr(target_report.severity, "value") else str(target_report.severity)
            status_str = target_report.status.value if hasattr(target_report.status, "value") else str(target_report.status)
            await ws_manager.publish(
                "SOS_CONFIRMED",
                {
                    "sos_id": str(target_report.id),
                    "trust_score": target_report.trust_score,
                    "severity": sev_str,
                    "status": status_str,
                    "confirmation_id": str(conf.id),
                },
            )

    logger.info(
        f"Triggered live simulation: seeded {len(seeded_units)} units, "
        f"{len(seeded_reports)} reports, and {len(seeded_confirmations)} crowd confirmations"
    )

    return {
        "status": "success",
        "seeded_units": len(seeded_units),
        "seeded_reports": len(seeded_reports),
        "seeded_confirmations": len(seeded_confirmations),
        "message": "Live scenario initiated successfully!",
    }

