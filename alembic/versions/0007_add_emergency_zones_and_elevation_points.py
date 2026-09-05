"""add emergency_zones and elevation_points tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-05 10:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "emergency_zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
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
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_emergency_zones_geometry ON emergency_zones USING GIST (geometry);")

    op.create_table(
        "elevation_points",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "geometry",
            geoalchemy2.types.Geometry(
                geometry_type="POINT",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                spatial_index=False,
            ),
            nullable=False,
        ),
        sa.Column("elevation_m", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_elevation_points_geometry ON elevation_points USING GIST (geometry);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_elevation_points_geometry;")
    op.drop_table("elevation_points")
    op.execute("DROP INDEX IF EXISTS ix_emergency_zones_geometry;")
    op.drop_table("emergency_zones")
