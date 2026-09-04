#!/usr/bin/env python3
"""SurakshaGrid PostgreSQL Database Seeder Script.

Pre-populates fresh Render PostgreSQL instances with rescue units, baseline SOS reports,
and a genesis event log before live simulations are run. Supports --force-reset flag
for clean demo restarts.
"""

import argparse
import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Ensure project root is in sys.path when executed directly as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.enums import RescueUnitStatus, RescueUnitType, SOSSeverity, SOSStatus
from app.models.event_log import EventLog
from app.models.rescue_unit import RescueUnit
from app.models.sos_confirmation import SOSConfirmation
from app.models.sos_report import SOSReport

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_db")


async def verify_spatial_indexes_and_geometries(db: AsyncSession) -> None:
    """Checks whether GiST spatial indexes exist and confirms geometry columns function correctly."""
    # 1. Check for spatial index migration (0002_enable_postgis_spatial_indexing)
    try:
        idx_res = await db.execute(
            text(
                "SELECT indexname FROM pg_indexes WHERE indexname IN "
                "('ix_sos_reports_location', 'ix_rescue_units_current_location')"
            )
        )
        found_indexes = set(idx_res.scalars().all())
        expected_indexes = {"ix_sos_reports_location", "ix_rescue_units_current_location"}

        if not expected_indexes.issubset(found_indexes):
            missing = expected_indexes - found_indexes
            logger.warning(
                f"⚠️  Spatial index migration (0002_enable_postgis_spatial_indexing) may not have been fully applied! "
                f"Missing GiST spatial index(es): {missing}. Please run 'alembic upgrade head'."
            )
        else:
            logger.info("✅ Confirmed PostGIS spatial indexes (ix_sos_reports_location, ix_rescue_units_current_location) are active.")
    except Exception as exc:
        logger.warning(f"⚠️  Could not verify spatial indexes: {exc}")

    # 2. Confirm inserted geometries work correctly with spatial_index=True
    try:
        units_res = await db.execute(select(RescueUnit))
        units = list(units_res.scalars().all())
        reports_res = await db.execute(select(SOSReport))
        reports = list(reports_res.scalars().all())

        for u in units:
            assert u.current_location is not None, f"Rescue unit {u.name} geometry location is null"
        for r in reports:
            assert r.location is not None, f"SOS report {r.id} geometry location is null"

        logger.info(
            f"✅ Confirmed inserted geometries work correctly with spatial_index=True: "
            f"{len(units)} rescue units and {len(reports)} SOS reports verified."
        )
    except Exception as exc:
        logger.error(f"❌ Geometry verification failed: {exc}")
        raise


async def seed_database(force_reset: bool = False) -> None:
    """Async database seeder function."""
    async with AsyncSessionLocal() as db:
        if force_reset:
            logger.info("⚠️  --force-reset flag passed. Wiping demo database state...")
            await db.execute(delete(SOSConfirmation))
            await db.execute(delete(SOSReport))
            await db.execute(delete(RescueUnit))
            await db.execute(delete(EventLog))
            await db.commit()
            logger.info("✅ Database tables cleared successfully.")

        # Check if rescue_units or sos_reports tables are already populated
        res_units = await db.execute(select(func.count()).select_from(RescueUnit))
        existing_unit_count = res_units.scalar_one()
        res_reports = await db.execute(select(func.count()).select_from(SOSReport))
        existing_report_count = res_reports.scalar_one()

        if (existing_unit_count > 0 or existing_report_count > 0) and not force_reset:
            logger.info(
                f"ℹ️  Database is already seeded with {existing_unit_count} rescue units and {existing_report_count} SOS reports. "
                "Skipping seeding (use --force-reset to overwrite)."
            )
            await verify_spatial_indexes_and_geometries(db)
            return

        logger.info("🚀 Seeding fresh database state...")
        now = datetime.now(timezone.utc)

        # 1. Seed Geographically Distributed Rescue Units (3 BOAT, 2 AMBULANCE, 2 DRONE)
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

        # 2. Seed Baseline Sample SOS Reports
        sos_reports_data = [
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
                80.2450,
                13.1100,
                SOSSeverity.LOW,
                None,
                None,
                0,
                "Waterlogging on street road.",
                now - timedelta(minutes=2, seconds=15),
            ),
        ]

        seeded_reports: list[SOSReport] = []
        for lon, lat, sev, photo_url, conf, trust, transcript, created_ts in sos_reports_data:
            report = SOSReport(
                id=uuid.uuid4(),
                location=f"SRID=4326;POINT({lon} {lat})",
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

        # 3. Seed Genesis Log Record in event_log
        genesis_log = EventLog(
            event_type="SYSTEM_INITIALIZED",
            payload={
                "status": "seeded",
                "seeded_units": len(seeded_units),
                "seeded_reports": len(seeded_reports),
                "initialized_at": now.isoformat(),
            },
            occurred_at=now,
        )
        db.add(genesis_log)

        # Commit all seeded entries
        await db.commit()

        # 4. Verify spatial indexes and inserted geometries
        await verify_spatial_indexes_and_geometries(db)

        logger.info(
            f"🎉 Database successfully seeded with {len(seeded_units)} rescue units, "
            f"{len(seeded_reports)} baseline SOS reports, and SYSTEM_INITIALIZED event log!"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="SurakshaGrid Database Seeder")
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help="Wipe all existing database records and re-seed clean demo state.",
    )
    args = parser.parse_args()
    asyncio.run(seed_database(force_reset=args.force_reset))


if __name__ == "__main__":
    main()
