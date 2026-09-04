"""create live_rainfall_readings table

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-04 15:40:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "live_rainfall_readings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rainfall_intensity", sa.Float(), nullable=False),
        sa.Column("raw_mm", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_live_rainfall_readings_timestamp",
        "live_rainfall_readings",
        ["timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_live_rainfall_readings_timestamp", table_name="live_rainfall_readings")
    op.drop_table("live_rainfall_readings")
