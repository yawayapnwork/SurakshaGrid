"""enable postgis spatial indexing

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-03 20:20:00

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure GiST spatial indices exist on location columns for ultra-fast PostGIS ST_DWithin and ST_Distance spatial queries
    op.execute("CREATE INDEX IF NOT EXISTS ix_sos_reports_location ON sos_reports USING GIST (location);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rescue_units_current_location ON rescue_units USING GIST (current_location);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_rescue_units_current_location;")
    op.execute("DROP INDEX IF EXISTS ix_sos_reports_location;")
