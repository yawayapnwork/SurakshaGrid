import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmergencyZone(Base):
    """Fixed dispatch/administrative zone polygon (e.g. a ward or sector) that risk

    scoring is computed against. Distinct from `FloodZone`, which stores ephemeral
    simulated flood *extent* polygons rather than designated response boundaries.
    """

    __tablename__ = "emergency_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    geometry: Mapped[str] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_emergency_zones_geometry", "geometry", postgresql_using="gist"),
    )
