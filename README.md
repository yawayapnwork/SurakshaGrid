# SurakshaGrid

Production backend for a flood response coordination platform: FastAPI + SQLAlchemy 2.0 (async) + asyncpg + PostGIS on managed PostgreSQL, deployed as a Render Web Service.

## Stack

- FastAPI, Pydantic v2 / pydantic-settings
- SQLAlchemy 2.0 async ORM, asyncpg driver
- PostGIS via GeoAlchemy2
- Alembic migrations

## Local Setup

```bash
python -m venv .venv
.venv/Scripts/activate    # or source .venv/bin/activate on Unix
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, JWT_SECRET, OSRM_BASE_URL
alembic upgrade head
python scripts/seed_db.py   # seed initial rescue units, SOS reports & genesis event log
uvicorn app.main:app --reload
```

`DATABASE_URL` must use the `postgresql+asyncpg://` scheme. `CORS_ORIGINS` is a comma-separated list of allowed origins. `ADMIN_PASSWORD` is a required environment variable containing a bcrypt password hash.

To generate a bcrypt password hash for `ADMIN_PASSWORD`:
```bash
python -c "from app.core.security import get_password_hash; print(get_password_hash('yourpassword'))"
```

## Database Seeding

To pre-populate a fresh database with geographically distributed rescue units (3 BOAT, 2 AMBULANCE, 2 DRONE), baseline SOS reports, and a genesis log:

```bash
# Initial idempotent seed (skips if already seeded)
python scripts/seed_db.py

# Force wipe and re-seed (clean demo restarts)
python scripts/seed_db.py --force-reset
```

## Project Layout

```
app/
    core/config.py        # pydantic-settings, strict env validation
    db/session.py          # async engine + session factory
    db/base.py             # declarative base
    models/                # SQLAlchemy ORM models (sos_reports, rescue_units, sos_confirmations, event_log)
    schemas/               # Pydantic request/response schemas
    api/health.py          # /healthz liveness + DB check
    main.py                # FastAPI app, CORS, router wiring
scripts/
    seed_db.py             # Async database seeder script with --force-reset flag
    smoke_test.py          # E2E production smoke test runner
alembic/                  # migrations (0001 creates postgis extension + all tables)
render.yaml              # Render Web Service deployment blueprint
```

## Deployment (Render)

`render.yaml` defines a web service that runs `alembic upgrade head && python -m scripts.seed_db` before starting `uvicorn`. Set `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, and `OSRM_BASE_URL` as environment variables in the Render dashboard (or via `render.yaml` env var groups); `JWT_SECRET` is auto-generated.