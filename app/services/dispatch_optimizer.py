import logging
import math
from datetime import datetime, timezone
from typing import Any

import httpx
import numpy as np
from geoalchemy2.shape import to_shape
from scipy.optimize import linear_sum_assignment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import RescueUnitStatus, SOSSeverity, SOSStatus
from app.models.event_log import EventLog
from app.models.rescue_unit import RescueUnit
from app.models.sos_report import SOSReport
from app.schemas.dispatch import DispatchAssignment
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

SEVERITY_WEIGHTS: dict[SOSSeverity, float] = {
    SOSSeverity.LOW: 0.1,
    SOSSeverity.MEDIUM: 0.25,
    SOSSeverity.HIGH: 0.5,
    SOSSeverity.CRITICAL_TRAPPED: 0.75,
}


def extract_coordinates(geom: Any) -> tuple[float, float]:
    """Extracts (longitude, latitude) tuple from PostGIS Geometry, Shapely object, or WKT string."""
    if hasattr(geom, "x") and hasattr(geom, "y"):
        return (float(geom.x), float(geom.y))
    if hasattr(geom, "data") or hasattr(geom, "srid") or hasattr(geom, "desc"):
        try:
            shape = to_shape(geom)
            return (float(shape.x), float(shape.y))
        except Exception:
            pass
    val_str = str(geom)
    if "POINT" in val_str:
        clean_str = val_str.split(";")[-1].replace("POINT(", "").replace(")", "").strip()
        parts = clean_str.split()
        if len(parts) >= 2:
            return (float(parts[0]), float(parts[1]))
    return (80.2707, 13.0827)


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in meters using Haversine formula."""
    r = 6371000.0  # Radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def compute_haversine_duration_matrix(
    unit_coords: list[tuple[float, float]],
    incident_coords: list[tuple[float, float]],
    avg_speed_m_s: float = 8.333,
) -> np.ndarray:
    """Computes fallback duration matrix (in seconds) between units and incidents based on Haversine distance."""
    num_units = len(unit_coords)
    num_incidents = len(incident_coords)
    matrix = np.zeros((num_units, num_incidents), dtype=float)

    for i, (u_lon, u_lat) in enumerate(unit_coords):
        for j, (i_lon, i_lat) in enumerate(incident_coords):
            dist = haversine_distance_meters(u_lat, u_lon, i_lat, i_lon)
            matrix[i, j] = dist / avg_speed_m_s

    return matrix


async def compute_postgis_duration_matrix(
    db: AsyncSession,
    available_units: list[RescueUnit],
    pending_reports: list[SOSReport],
    avg_speed_m_s: float = 8.333,
) -> np.ndarray:
    """Computes distance matrix (in seconds) between rescue units and SOS reports
    using a single batched PostGIS ST_Distance query over spatial geography.
    """
    num_units = len(available_units)
    num_incidents = len(pending_reports)
    matrix = np.zeros((num_units, num_incidents), dtype=float)

    unit_ids = [u.id for u in available_units]
    report_ids = [r.id for r in pending_reports]

    try:
        from sqlalchemy import text
        stmt = text("""
            SELECT u.id AS unit_id, r.id AS report_id,
                   ST_Distance(u.current_location::geography, r.location::geography) AS dist_m
            FROM rescue_units u
            CROSS JOIN sos_reports r
            WHERE u.id = ANY(:unit_ids) AND r.id = ANY(:report_ids)
        """)
        result = await db.execute(stmt, {"unit_ids": unit_ids, "report_ids": report_ids})
        rows = result.fetchall()

        unit_id_map = {u.id: i for i, u in enumerate(available_units)}
        report_id_map = {r.id: j for j, r in enumerate(pending_reports)}

        for row in rows:
            u_idx = unit_id_map.get(row.unit_id)
            r_idx = report_id_map.get(row.report_id)
            if u_idx is not None and r_idx is not None:
                dist_m = float(row.dist_m or 0.0)
                matrix[u_idx, r_idx] = dist_m / avg_speed_m_s
    except Exception as exc:
        logger.warning(f"Batched PostGIS duration calculation failed ({exc}), using Haversine fallback")
        unit_coords = [extract_coordinates(u.current_location) for u in available_units]
        incident_coords = [extract_coordinates(r.location) for r in pending_reports]
        matrix = compute_haversine_duration_matrix(unit_coords, incident_coords, avg_speed_m_s)

    return matrix


async def fetch_osrm_duration_matrix(
    unit_coords: list[tuple[float, float]],
    incident_coords: list[tuple[float, float]],
    timeout_seconds: float = 1.5,
) -> np.ndarray | None:
    """Queries OSRM Table Service for driving duration matrix in seconds.

    Returns None if request fails or times out.
    """
    settings = get_settings()
    base_url = str(settings.OSRM_BASE_URL).rstrip("/")

    # Combine all coordinates (units followed by incidents)
    all_coords = unit_coords + incident_coords
    coords_str = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in all_coords)

    unit_indices = ";".join(str(i) for i in range(len(unit_coords)))
    incident_indices = ";".join(str(i) for i in range(len(unit_coords), len(all_coords)))

    url = f"{base_url}/table/v1/driving/{coords_str}?sources={unit_indices}&destinations={incident_indices}"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and "durations" in data:
                    durations = np.array(data["durations"], dtype=float)
                    if durations.shape == (len(unit_coords), len(incident_coords)):
                        # Handle any nulls or infs from unreachable OSRM nodes
                        durations = np.nan_to_num(durations, nan=3600.0, posinf=3600.0)
                        return durations
    except Exception as exc:
        logger.warning(f"OSRM Table service unavailable ({exc}), falling back to PostGIS spatial matrix")

    return None


async def optimize_rescue_dispatch(db: AsyncSession) -> list[DispatchAssignment]:
    """Queries pending SOS reports and available rescue units, computes OSRM/PostGIS/Haversine cost matrix,

    solves optimal assignments via Hungarian algorithm, updates DB states, logs events, and broadcasts via WS.
    """
    # 1. Fetch pending SOS reports
    sos_stmt = select(SOSReport).where(SOSReport.status == SOSStatus.PENDING).order_by(SOSReport.created_at.asc())
    sos_result = await db.execute(sos_stmt)
    pending_reports = list(sos_result.scalars().all())

    # 2. Fetch available rescue units
    unit_stmt = select(RescueUnit).where(RescueUnit.status == RescueUnitStatus.AVAILABLE)
    unit_result = await db.execute(unit_stmt)
    available_units = list(unit_result.scalars().all())

    if not pending_reports or not available_units:
        logger.info("Dispatch optimizer skipped: no pending SOS reports or available rescue units")
        return []

    # 3. Extract coordinates
    unit_coords = [extract_coordinates(u.current_location) for u in available_units]
    incident_coords = [extract_coordinates(r.location) for r in pending_reports]

    # 4. Compute duration matrix (ETA in seconds): Tier 1 OSRM -> Tier 2 Batched PostGIS ST_Distance -> Tier 3 Haversine
    duration_matrix = await fetch_osrm_duration_matrix(unit_coords, incident_coords)
    if duration_matrix is None:
        duration_matrix = await compute_postgis_duration_matrix(db, available_units, pending_reports)

    # 5. Formulate assignment cost matrix: Cost = ETA_minutes * (1.0 - (urgency_weight + trust_weight))
    num_units = len(available_units)
    num_incidents = len(pending_reports)
    cost_matrix = np.zeros((num_units, num_incidents), dtype=float)

    urgency_trust_weights: list[float] = []
    for r in pending_reports:
        urgency_w = SEVERITY_WEIGHTS.get(r.severity, 0.25)
        trust_w = min(r.trust_score * 0.05, 0.2)
        total_w = min(urgency_w + trust_w, 0.9)  # Cap weight to keep cost positive
        urgency_trust_weights.append(total_w)

    for i in range(num_units):
        for j in range(num_incidents):
            eta_seconds = duration_matrix[i, j]
            eta_minutes = eta_seconds / 60.0
            multiplier = 1.0 - urgency_trust_weights[j]
            cost_matrix[i, j] = eta_minutes * multiplier

    # 6. Solve optimal global assignments using SciPy linear_sum_assignment (Hungarian Algorithm)
    row_indices, col_indices = linear_sum_assignment(cost_matrix)

    assignments: list[DispatchAssignment] = []
    now = datetime.now(timezone.utc)

    for u_idx, r_idx in zip(row_indices, col_indices, strict=False):
        unit = available_units[u_idx]
        report = pending_reports[r_idx]
        eta_sec = float(duration_matrix[u_idx, r_idx])
        cost_val = float(cost_matrix[u_idx, r_idx])

        # State Mutations
        report.status = SOSStatus.ASSIGNED
        unit.status = RescueUnitStatus.DISPATCHED

        assignment = DispatchAssignment(
            sos_id=report.id,
            rescue_unit_id=unit.id,
            unit_name=unit.name,
            eta_seconds=eta_sec,
            cost=cost_val,
            assigned_at=now,
        )
        assignments.append(assignment)

        # Log event in event_log table
        event_payload = {
            "sos_id": str(report.id),
            "rescue_unit_id": str(unit.id),
            "unit_name": unit.name,
            "unit_type": unit.unit_type.value if hasattr(unit.unit_type, "value") else str(unit.unit_type),
            "eta_seconds": eta_sec,
            "cost": cost_val,
            "assigned_at": now.isoformat(),
        }

        event = EventLog(
            event_type="UNIT_DISPATCHED",
            payload=event_payload,
        )
        db.add(event)

    # Commit DB session
    await db.commit()

    # Broadcast WebSocket notifications for assigned units
    for assignment in assignments:
        await ws_manager.publish(
            "UNIT_DISPATCHED",
            {
                "sos_id": str(assignment.sos_id),
                "rescue_unit_id": str(assignment.rescue_unit_id),
                "unit_name": assignment.unit_name,
                "eta_seconds": assignment.eta_seconds,
                "cost": assignment.cost,
                "assigned_at": assignment.assigned_at.isoformat(),
            },
        )

    logger.info(f"Dispatched {len(assignments)} rescue units to pending SOS reports")
    return assignments
