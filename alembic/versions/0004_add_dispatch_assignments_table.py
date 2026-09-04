"""add dispatch_assignments table

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-04 14:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dispatch_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sos_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rescue_unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_name", sa.String(length=255), nullable=False),
        sa.Column("eta_seconds", sa.Float(), nullable=False),
        sa.Column("cost", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["sos_id"], ["sos_reports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rescue_unit_id"], ["rescue_units.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dispatch_assignments_sos_id", "dispatch_assignments", ["sos_id"], unique=False)
    op.create_index("ix_dispatch_assignments_rescue_unit_id", "dispatch_assignments", ["rescue_unit_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dispatch_assignments_rescue_unit_id", table_name="dispatch_assignments")
    op.drop_index("ix_dispatch_assignments_sos_id", table_name="dispatch_assignments")
    op.drop_table("dispatch_assignments")
