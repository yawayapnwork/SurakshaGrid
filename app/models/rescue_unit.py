import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Enum, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import RescueUnitStatus, RescueUnitType


class RescueUnit(Base):
    __tablename__ = "rescue_units"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_type: Mapped[RescueUnitType] = mapped_column(
        Enum(RescueUnitType, name="rescue_unit_type", native_enum=True),
        nullable=False,
    )
    current_location: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    status: Mapped[RescueUnitStatus] = mapped_column(
        Enum(RescueUnitStatus, name="rescue_unit_status", native_enum=True),
        nullable=False,
        server_default=RescueUnitStatus.AVAILABLE.value,
    )

    __table_args__ = (
        Index("ix_rescue_units_current_location", "current_location", postgresql_using="gist"),
    )
