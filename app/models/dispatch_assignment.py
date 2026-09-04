import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DispatchAssignmentModel(Base):
    __tablename__ = "dispatch_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sos_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sos_reports.id", ondelete="CASCADE"), nullable=False
    )
    rescue_unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rescue_units.id", ondelete="CASCADE"), nullable=False
    )
    unit_name: Mapped[str] = mapped_column(String(255), nullable=False)
    eta_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.0")
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_dispatch_assignments_sos_id", "sos_id"),
        Index("ix_dispatch_assignments_rescue_unit_id", "rescue_unit_id"),
    )
