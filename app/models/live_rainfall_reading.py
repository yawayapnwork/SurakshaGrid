import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LiveRainfallReading(Base):
    """SQLAlchemy model representing an ingested live rainfall reading from external sensors or APIs."""

    __tablename__ = "live_rainfall_readings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    rainfall_intensity: Mapped[float] = mapped_column(Float, nullable=False)
    raw_mm: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(255), default="openweathermap", nullable=False)

    # Nullable: older readings ingested before this column existed, or a reading a caller
    # didn't tag with a location, have no coordinate — those only ever serve as the last-
    # resort global fallback in find_nearest_recent_reading(), never a "nearest" match.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
