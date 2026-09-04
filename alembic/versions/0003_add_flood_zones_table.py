"""add flood_zones table

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-04 13:46:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "flood_zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "geometry",
            geoalchemy2.types.Geometry(
                geometry_type="POLYGON",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                spatial_index=False,
            ),
            nullable=False,
        ),
        sa.Column("rainfall_intensity", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("sim_id", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_flood_zones_geometry ON flood_zones USING GIST (geometry);")
    op.create_index("ix_flood_zones_sim_id", "flood_zones", ["sim_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_flood_zones_sim_id", table_name="flood_zones")
    op.execute("DROP INDEX IF EXISTS ix_flood_zones_geometry;")
    op.drop_table("flood_zones")
