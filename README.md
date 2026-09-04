# SurakshaGrid

Production backend for a flood response coordination platform: FastAPI + SQLAlchemy 2.0 (async) + asyncpg + PostGIS (ST_DWithin spatial indexing & nearby SOS lookups) on managed PostgreSQL, deployed as a Render Web Service.

## Architecture & Core Features

- **Server-Side Auth Proxy**: Next.js API routes act as a secure server-side auth proxy holding officer credentials (`ADMIN_USERNAME` / `ADMIN_PASSWORD_PLAIN` or environment variables). JWT tokens are handled strictly server-to-server; the client browser never receives or stores administrative tokens directly.
- **3-Tier Dispatch Optimizer**: High-efficiency unit assignment engine using SciPy's Hungarian algorithm (`scipy.optimize.linear_sum_assignment`) with a robust 3-tier travel time/ETA calculation engine:
  1. **Tier 1 (OSRM Table Service)**: Real road network routing and travel duration matrices via Open Source Routing Machine.
  2. **Tier 2 (Batched PostGIS Geodesic Distance)**: `ST_Distance` over `geography` types for fast, accurate spherical Earth surface distance calculations on PostgreSQL.
  3. **Tier 3 (Haversine Formula)**: Pure mathematical fallback calculation if external services and spatial DB queries are unreachable.
- **Spatial Indexing & Radius Filtering**: PostGIS GiST spatial indexing (`ix_sos_reports_location`, `ix_rescue_units_current_location`) powering `ST_DWithin` radius filtering for fast nearby SOS report lookups.
- **Computer Vision & Verification**: OpenCV water evidence confidence scoring analyzing flooded visual content.
- **Citizen SOS Reporting & QR Code Flow**: Dedicated public citizen interface at `/report` allowing citizens to submit flood emergency reports with GPS location, photo verification, and voice transcripts. The officer command dashboard includes a live QR code link for instant mobile access during field testing or live demos.
- **Staggered Live Scenario Simulation**: Background task spawner delivering 12 realistic SOS reports with staggered timing over ~40–90 seconds via Redis-backed cross-worker session synchronization and real-time WebSocket broadcasts.
- **Caching & Rate Limiting**: Redis async client with 3s TTL operational metrics caching and IP rate limiting.

## Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/healthz` | System liveness & PostgreSQL connection health check |
| `POST` | `/api/v1/auth/login` | Officer JWT authentication (`ADMIN_USERNAME` / `ADMIN_PASSWORD_PLAIN`) |
| `GET` | `/api/v1/risk-scores/simulate` | Dynamic What-If flood risk grid simulator by rainfall intensity (`?rainfall=75`) |
| `GET` | `/api/v1/flood-zones/simulate` | Live flood zone extent simulator returning GeoJSON `FeatureCollection` polygons (`?rainfall=50`) |
| `POST` | `/api/v1/simulation/trigger` | Resets demo state, seeds 7 rescue units, and schedules background staggered SOS report delivery (~40–90s) |
| `POST` | `/api/v1/simulation/reset` | Resets simulation state & clears demo tables across all workers |
| `POST` | `/api/v1/sos` | Citizen SOS flood report submission with OpenCV photo verification |
| `GET` | `/api/v1/sos/nearby` | Spatial query for nearby active SOS reports via PostGIS `ST_DWithin` & GiST index (`?lat=13.08&lon=80.27&radius_meters=5000`) |
| `POST` | `/api/v1/sos/{id}/confirm` | Citizen/field confirmation to escalate trust score |
| `POST` | `/api/v1/dispatch/run` | SciPy Hungarian algorithm optimal rescue unit assignment using 3-tier ETA calculation |
| `GET` | `/api/v1/analytics/live-stats` | Aggregated operational metrics (cached in Redis for 3s) |
| `GET` | `/api/v1/replay/timeline` | Incident history timeline replay |

## Local Setup

```bash
python -m venv .venv
.venv/Scripts/activate    # or source .venv/bin/activate on Unix
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, JWT_SECRET, OSRM_BASE_URL
alembic upgrade head
python scripts/seed_db.py   # seed initial rescue units, baseline reports & genesis event log
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
> **Live Demo Rehearsal Note**: When triggering a flood event via `POST /api/v1/simulation/trigger`, SOS reports are spawned **live and progressively over background tasks** rather than in a bulk seed. 
> - Reports arrive sequentially over ~40–90 seconds with realistic staggered delays between reports.
> - Presenters and reviewers rehearsing the demo should **wait ~40–90 seconds after triggering the flood event for the full incident scenario to unfold** before running dispatch optimization or viewing final operational metrics.

### Automated 7-Step Guided Demo Tour

The command dashboard includes an automated **Guided Demo Tour** (`frontend/hooks/useDemoTour.ts`) triggered via the "Start Guided Demo" button in the UI header. It auto-plays a 7-step interactive walkthrough demonstrating key platform capabilities:
1. **Baseline Monitoring**: Validates 0% rainfall baseline stats.
2. **What-If Risk Simulation**: Programmatically slides rainfall intensity to 75mm/h and re-colors risk grid cells.
3. **Scenario Generator**: Triggers live flood simulation (7 rescue units, 12 staggered reports, alert siren).
4. **OpenCV Water Verification**: Displays photo-verified SOS report with 96.5% visual confidence score.
5. **Hungarian Dispatch**: Runs SciPy dispatch optimizer and auto-fits camera bounds to optimal rescue routes.
6. **Explainable Risk AI**: Selects a high-risk cell polygon and displays breakdown analytics.
7. **Digital Twin Time Travel**: Opens historical incident replay scrubber and steps backward across timeline.

## Project Layout

```
app/
    core/config.py        # pydantic-settings, strict env validation
    db/session.py          # async engine + session factory
    db/base.py             # declarative base
    models/                # SQLAlchemy ORM models (sos_reports, rescue_units, sos_confirmations, event_log)
    schemas/               # Pydantic request/response schemas
    routers/               # FastAPI route handlers (sos, simulation, flood_zones, dispatch, risk, analytics, replay, auth)
    services/              # CV service (OpenCV), 3-tier dispatch optimizer (SciPy + OSRM + PostGIS), WebSocket manager
scripts/
    seed_db.py             # Async database seeder script with spatial index validation & --force-reset flag
    smoke_test.py          # E2E production smoke test runner (tests flood zones, auth, CV, dispatch, progressive polling)
alembic/                  # migrations (0001 schema + 0002 PostGIS spatial indexing)
render.yaml              # Render Web Service deployment blueprint
```

## Deployment (Render)

`render.yaml` defines a web service that runs `alembic upgrade head` before starting `uvicorn`. Seeding is decoupled from process restarts to prevent accidental state resets during live demos; run `python -m scripts.seed_db` manually on initial deployment if database seeding is required. Set `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, and `OSRM_BASE_URL` as environment variables in the Render dashboard (or via `render.yaml` env var groups); `JWT_SECRET` is auto-generated.

> [!NOTE]
> **Render Hosting Cost Breakdown**: `render.yaml` configures the `starter` plan for all three managed components:
> - **Web Service** (`starter` tier): ~$7/month
> - **Managed PostgreSQL + PostGIS** (`starter` tier): ~$7/month
> - **Managed Redis** (`starter` tier): ~$10/month
> 
> **Total combined cost**: **~$24/month**. If deploying on a budget, you can adjust individual service plans (e.g. `free` or standard PostgreSQL/Redis instances) in `render.yaml` or through the Render dashboard.