import uuid
import pytest
from geoalchemy2 import Geography
from sqlalchemy import cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import RescueUnitStatus, RescueUnitType, SOSSeverity, SOSStatus
from app.models.flood_zone import FloodZone
from app.models.rescue_unit import RescueUnit
from app.models.sos_report import SOSReport
from app.routers.sos import get_nearby_sos_reports
from app.services.dispatch_optimizer import compute_postgis_duration_matrix

settings = get_settings()


@pytest.mark.asyncio
async def test_postgis_gist_spatial_indexes_active(postgres_session: AsyncSession):
    """Verifies that GiST spatial indexes exist and are active in PostgreSQL."""
    res = await postgres_session.execute(
        text(
            "SELECT indexname FROM pg_indexes WHERE indexname IN "
            "('ix_sos_reports_location', 'ix_rescue_units_current_location')"
        )
    )
    indexes = set(res.scalars().all())
    assert "ix_sos_reports_location" in indexes, "Missing GiST index ix_sos_reports_location"
    assert "ix_rescue_units_current_location" in indexes, "Missing GiST index ix_rescue_units_current_location"


@pytest.mark.asyncio
async def test_postgis_st_distance_cross_join(postgres_session: AsyncSession):
    """Integration test executing ST_Distance cross join over geography types on real PostgreSQL."""
    test_sim_id = f"test-dist-{uuid.uuid4()}"

    unit_1 = RescueUnit(
        id=uuid.uuid4(),
        name="Test Unit 1",
        unit_type=RescueUnitType.BOAT,
        current_location="SRID=4326;POINT(80.2707 13.0827)",
        status=RescueUnitStatus.AVAILABLE,
        sim_id=test_sim_id,
    )
    unit_2 = RescueUnit(
        id=uuid.uuid4(),
        name="Test Unit 2",
        unit_type=RescueUnitType.AMBULANCE,
        current_location="SRID=4326;POINT(80.2200 13.0400)",
        status=RescueUnitStatus.AVAILABLE,
        sim_id=test_sim_id,
    )

    report_1 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2715 13.0835)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.CRITICAL_TRAPPED,
        sim_id=test_sim_id,
    )
    report_2 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2420 13.0550)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.HIGH,
        sim_id=test_sim_id,
    )

    postgres_session.add_all([unit_1, unit_2, report_1, report_2])
    await postgres_session.flush()

    try:
        matrix = await compute_postgis_duration_matrix(
            postgres_session, [unit_1, unit_2], [report_1, report_2]
        )

        assert matrix.shape == (2, 2)
        assert matrix[0, 0] > 0.0
        # Unit 1 (80.2707, 13.0827) is closer to Report 1 (80.2715, 13.0835) than to Report 2 (80.2420, 13.0550)
        assert matrix[0, 0] < matrix[0, 1]
        # Unit 2 (80.2200, 13.0400) is closer to Report 2 (80.2420, 13.0550) than Unit 1 is to Report 2
        assert matrix[1, 1] < matrix[0, 1]
    finally:
        await postgres_session.delete(unit_1)
        await postgres_session.delete(unit_2)
        await postgres_session.delete(report_1)
        await postgres_session.delete(report_2)
        await postgres_session.commit()


@pytest.mark.asyncio
async def test_postgis_st_dwithin_radius_and_sim_id(postgres_session: AsyncSession):
    """Integration test executing ST_DWithin spatial index filter and sim_id scoping on real PostgreSQL."""
    test_sim_a = f"test-sim-a-{uuid.uuid4()}"
    test_sim_b = f"test-sim-b-{uuid.uuid4()}"

    # Report 1: 80.2707, 13.0827 (Center of query, ~0m)
    report_1 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2707 13.0827)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.HIGH,
        sim_id=test_sim_a,
    )
    # Report 2: 80.1000, 13.0827 (~18.5 km away, outside 5000m radius)
    report_2 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.1000 13.0827)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.HIGH,
        sim_id=test_sim_a,
    )
    # Report 3: 80.2708, 13.0828 (~15m away, inside radius, but different sim_id)
    report_3 = SOSReport(
        id=uuid.uuid4(),
        location="SRID=4326;POINT(80.2708 13.0828)",
        status=SOSStatus.PENDING,
        severity=SOSSeverity.CRITICAL_TRAPPED,
        sim_id=test_sim_b,
    )

    postgres_session.add_all([report_1, report_2, report_3])
    await postgres_session.flush()

    try:
        # Test 1: Unscoped radius query (returns report_1 and report_3, excludes report_2)
        reports_unscoped = await get_nearby_sos_reports(
            latitude=13.0827,
            longitude=80.2707,
            radius_meters=5000.0,
            sim_id=None,
            db=postgres_session,
        )
        unscoped_ids = {r.id for r in reports_unscoped}
        assert str(report_1.id) in unscoped_ids
        assert str(report_3.id) in unscoped_ids
        assert str(report_2.id) not in unscoped_ids

        # Test 2: Scoped radius query with sim_id (returns only report_1)
        reports_scoped = await get_nearby_sos_reports(
            latitude=13.0827,
            longitude=80.2707,
            radius_meters=5000.0,
            sim_id=test_sim_a,
            db=postgres_session,
        )
        scoped_ids = {r.id for r in reports_scoped}
        assert str(report_1.id) in scoped_ids
        assert str(report_2.id) not in scoped_ids
        assert str(report_3.id) not in scoped_ids
    finally:
        await postgres_session.delete(report_1)
        await postgres_session.delete(report_2)
        await postgres_session.delete(report_3)
        await postgres_session.commit()


@pytest.mark.asyncio
async def test_postgis_st_area_union_spatial_query(postgres_session: AsyncSession):
    """Integration test executing ST_Area over ST_Union of FloodZone geometries on real PostgreSQL."""
    test_sim_id = f"test-area-{uuid.uuid4()}"

    fz = FloodZone(
        id=uuid.uuid4(),
        geometry="SRID=4326;POLYGON((80.15 12.95, 80.19 12.95, 80.19 12.99, 80.15 12.99, 80.15 12.95))",
        sim_id=test_sim_id,
    )
    postgres_session.add(fz)
    await postgres_session.flush()

    try:
        area_query = select(
            func.coalesce(
                func.ST_Area(
                    cast(func.ST_Union(FloodZone.geometry), Geography)
                ) / 1000000.0,
                0.0,
            )
        ).where(FloodZone.sim_id == test_sim_id)

        res = await postgres_session.execute(area_query)
        area_km2 = float(res.scalar() or 0.0)
        assert area_km2 > 0.0
    finally:
        await postgres_session.delete(fz)
        await postgres_session.commit()
