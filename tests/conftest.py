import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Set dummy environment variables required by pydantic Settings during tests
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/surakshagrid_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault(
    "JWT_SECRET", "super-secret-jwt-key-with-at-least-32-characters"
)
os.environ.setdefault("OSRM_BASE_URL", "http://localhost:5000")
os.environ.setdefault("ENVIRONMENT", "testing")
# Test-only admin password hash (bcrypt hash of 'test-password-123', do not call bcrypt at import time)
os.environ.setdefault(
    "ADMIN_PASSWORD", "$2b$12$eB0LrWCUA2q0MLDH16CH5uj4v9/xOrsAk.eQzVZesezRf7aJ6nPp6"
)


@pytest.fixture(scope="function")
async def postgres_session():
    """Yields a fresh, isolated AsyncSession for each test function connected to PostgreSQL/PostGIS.

    Uses NullPool so connections are created and disposed strictly within the active test's event loop.
    Rolls back uncommitted state upon completion to maintain test isolation and prevent asyncpg conflicts.
    """
    from app.core.config import get_settings
    settings = get_settings()

    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT PostGIS_Version();"))
            _ = res.scalar()
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"PostgreSQL/PostGIS database not available ({exc}). Skipping integration tests.")

    SessionMaker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionMaker() as session:
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()

    await engine.dispose()


