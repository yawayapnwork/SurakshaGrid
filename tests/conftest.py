import os

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
