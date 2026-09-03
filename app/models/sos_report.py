import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import SOSSeverity, SOSStatus


class SOSReport(Base):
    __tablename__ = "sos_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    location: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    status: Mapped[SOSStatus] = mapped_column(
        Enum(SOSStatus, name="sos_status", native_enum=True),
        nullable=False,
        server_default=SOSStatus.PENDING.value,
    )
    severity: Mapped[SOSSeverity] = mapped_column(
        Enum(SOSSeverity, name="sos_severity", native_enum=True),
        nullable=False,
    )
    photo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    visual_confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    trust_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    voice_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_sos_reports_location", "location", postgresql_using="gist"),
    )
