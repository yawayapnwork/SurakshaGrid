"""initial schema: postgis extension, sos_reports, rescue_units, sos_confirmations, event_log

Revision ID: 0001
Revises:
Create Date: 2026-09-03 00:00:00

"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    sos_status = postgresql.ENUM(
        "PENDING", "ASSIGNED", "RESOLVED", name="sos_status"
    )
    sos_severity = postgresql.ENUM(
        "LOW", "MEDIUM", "HIGH", "CRITICAL_TRAPPED", name="sos_severity"
    )
    rescue_unit_type = postgresql.ENUM(
        "BOAT", "AMBULANCE", "DRONE", name="rescue_unit_type"
    )
    rescue_unit_status = postgresql.ENUM(
        "AVAILABLE", "DISPATCHED", "MAINTENANCE", name="rescue_unit_status"
    )
    bind = op.get_bind()
    sos_status.create(bind, checkfirst=True)
    sos_severity.create(bind, checkfirst=True)
    rescue_unit_type.create(bind, checkfirst=True)
    rescue_unit_status.create(bind, checkfirst=True)

    op.create_table(
        "sos_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sos_status,
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("severity", sos_severity, nullable=False),
        sa.Column("photo_url", sa.String(length=2048), nullable=True),
        sa.Column("visual_confidence_score", sa.Float(), nullable=True),
        sa.Column("trust_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("voice_transcript", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_sos_reports_location",
        "sos_reports",
        ["location"],
        postgresql_using="gist",
    )

    op.create_table(
        "rescue_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("unit_type", rescue_unit_type, nullable=False),
        sa.Column(
            "current_location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            rescue_unit_status,
            nullable=False,
            server_default="AVAILABLE",
        ),
    )
    op.create_index(
        "ix_rescue_units_current_location",
        "rescue_units",
        ["current_location"],
        postgresql_using="gist",
    )

    op.create_table(
        "sos_confirmations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sos_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sos_reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "confirmed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_sos_confirmations_sos_id", "sos_confirmations", ["sos_id"]
    )

    op.create_table(
        "event_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_event_log_event_type", "event_log", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_event_log_event_type", table_name="event_log")
    op.drop_table("event_log")

    op.drop_index("ix_sos_confirmations_sos_id", table_name="sos_confirmations")
    op.drop_table("sos_confirmations")

    op.drop_index(
        "ix_rescue_units_current_location",
        table_name="rescue_units",
        postgresql_using="gist",
    )
    op.drop_table("rescue_units")

    op.drop_index(
        "ix_sos_reports_location", table_name="sos_reports", postgresql_using="gist"
    )
    op.drop_table("sos_reports")

    bind = op.get_bind()
    postgresql.ENUM(name="rescue_unit_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="rescue_unit_type").drop(bind, checkfirst=True)
    postgresql.ENUM(name="sos_severity").drop(bind, checkfirst=True)
    postgresql.ENUM(name="sos_status").drop(bind, checkfirst=True)
