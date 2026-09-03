# SurakshaGrid

Production backend for a flood response coordination platform: FastAPI + SQLAlchemy 2.0 (async) + asyncpg + PostGIS (ST_DWithin spatial indexing & nearby SOS lookups) on managed PostgreSQL, deployed as a Render Web Service.

## Stack

- **Framework & Validation**: FastAPI, Pydantic v2 / pydantic-settings
- **Database & ORM**: PostgreSQL with PostGIS (via GeoAlchemy2), SQLAlchemy 2.0 async ORM, asyncpg driver
- **Spatial Indexing & Queries**: PostGIS GiST spatial indexing (`ix_sos_reports_location`, `ix_rescue_units_current_location`) powering `ST_DWithin` radius filtering for nearby SOS report lookups & spatial distance routing calculations
- **Computer Vision & Optimization**: OpenCV (water evidence confidence scoring), SciPy (Hungarian algorithm dispatch optimizer)
- **Migrations & Caching**: Alembic migrations, Redis async client (3s TTL analytics caching & rate limiting)

## Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/healthz` | System liveness & PostgreSQL connection health check |
| `POST` | `/api/v1/auth/login` | Officer JWT authentication (`ADMIN_USERNAME` / `ADMIN_PASSWORD_PLAIN`) |
| `GET` | `/api/v1/risk-scores/simulate` | Dynamic What-If flood risk grid simulator by rainfall intensity (`?rainfall=75`) |
| `GET` | `/api/v1/flood-zones/simulate` | Live flood zone extent simulator returning GeoJSON `FeatureCollection` polygons (`?rainfall=50`) |
| `POST` | `/api/v1/simulation/trigger` | Triggers live staggered flood scenario generator (progressive SOS delivery over timeline) |
| `POST` | `/api/v1/simulation/reset` | Resets simulation state & re-seeds clean rescue unit baselines |
| `POST` | `/api/v1/sos` | Citizen SOS flood report submission with OpenCV photo verification |
| `GET` | `/api/v1/sos/nearby` | Spatial query for nearby active SOS reports via PostGIS `ST_DWithin` & GiST index |
| `POST` | `/api/v1/sos/{id}/confirm` | Citizen/field confirmation to escalate trust score |
| `POST` | `/api/v1/dispatch/run` | SciPy Hungarian algorithm optimal rescue unit assignment |
| `GET` | `/api/v1/analytics/live-stats` | Aggregated operational metrics (cached in Redis for 3s) |
| `GET` | `/api/v1/replay/timeline` | Incident history timeline replay |

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

## Database Seeding & Live Demo Rehearsal

To pre-populate a fresh database with geographically distributed rescue units (3 BOAT, 2 AMBULANCE, 2 DRONE), baseline SOS reports, and a genesis log:

```bash
# Initial idempotent seed (skips if already seeded, verifies PostGIS spatial indexes)
python scripts/seed_db.py

# Force wipe and re-seed (clean demo restarts)
python scripts/seed_db.py --force-reset
```

> [!IMPORTANT]
> **Live Demo Rehearsal Note**: When triggering a flood event via `POST /api/v1/simulation/trigger`, flood-zone expansion and SOS report delivery occur **live and progressively over background tasks** rather than instantly. 
> - Reports arrive sequentially over ~50–60 seconds (with realistic delays of 0s, 4s, 5s between reports).
> - Presenters and reviewers rehearsing the demo should **wait ~60 seconds after triggering the flood event for the full incident scenario to unfold** before running dispatch optimization or viewing final operational metrics.

## Project Layout

```
app/
    core/config.py        # pydantic-settings, strict env validation
    db/session.py          # async engine + session factory
    db/base.py             # declarative base
    models/                # SQLAlchemy ORM models (sos_reports, rescue_units, sos_confirmations, event_log)
    schemas/               # Pydantic request/response schemas
    routers/               # FastAPI route handlers (sos, simulation, flood_zones, dispatch, risk, analytics, replay, auth)
    services/              # CV service (OpenCV), dispatch optimizer (SciPy), WebSocket manager
scripts/
    seed_db.py             # Async database seeder script with spatial index validation & --force-reset flag
    smoke_test.py          # E2E production smoke test runner (tests flood zones, auth, CV, dispatch, progressive polling)
alembic/                  # migrations (0001 schema + 0002 PostGIS spatial indexing)
render.yaml              # Render Web Service deployment blueprint
```

## Deployment (Render)

`render.yaml` defines a web service that runs `alembic upgrade head && python -m scripts.seed_db` before starting `uvicorn`. Set `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, and `OSRM_BASE_URL` as environment variables in the Render dashboard (or via `render.yaml` env var groups); `JWT_SECRET` is auto-generated.