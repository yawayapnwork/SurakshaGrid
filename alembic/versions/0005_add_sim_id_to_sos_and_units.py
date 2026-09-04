"""add sim_id to sos_reports and rescue_units

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-04 14:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sos_reports", sa.Column("sim_id", sa.String(length=255), nullable=True))
    op.create_index("ix_sos_reports_sim_id", "sos_reports", ["sim_id"], unique=False)

    op.add_column("rescue_units", sa.Column("sim_id", sa.String(length=255), nullable=True))
    op.create_index("ix_rescue_units_sim_id", "rescue_units", ["sim_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_rescue_units_sim_id", table_name="rescue_units")
    op.drop_column("rescue_units", "sim_id")

    op.drop_index("ix_sos_reports_sim_id", table_name="sos_reports")
    op.drop_column("sos_reports", "sim_id")
