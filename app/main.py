from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import get_settings
from app.db.session import engine
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.dispatch import router as dispatch_router
from app.routers.flood_zones import router as flood_zones_router
from app.routers.replay import router as replay_router
from app.routers.risk import router as risk_router
from app.routers.simulation import router as simulation_router
from app.routers.sos import router as sos_router
from app.routers.ws import router as ws_router
from app.services.ws_manager import ws_manager

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await ws_manager.start_redis_listener()
    yield
    await ws_manager.stop()
    await engine.dispose()


app = FastAPI(
    title="SurakshaGrid API",
    description="Flood response coordination platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(sos_router, prefix="/api/v1")
app.include_router(dispatch_router, prefix="/api/v1")
app.include_router(risk_router, prefix="/api/v1")
app.include_router(flood_zones_router, prefix="/api/v1")
app.include_router(replay_router, prefix="/api/v1")
app.include_router(simulation_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(ws_router)


