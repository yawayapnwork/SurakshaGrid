import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Float, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ElevationPoint(Base):
    """A single sampled point from a regional elevation grid (e.g. exported from a DEM),

    used to estimate low-terrain flood hazard within emergency zones.
    """

    __tablename__ = "elevation_points"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    geometry: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    elevation_m: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (
        Index("ix_elevation_points_geometry", "geometry", postgresql_using="gist"),
    )
