import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.core.config import get_settings
from app.db.session import engine
from app.routers.alerts import router as alerts_router
from app.routers.analytics import router as analytics_router
from app.routers.audio_transcription import router as audio_transcription_router
from app.routers.auth import router as auth_router
from app.routers.dispatch import router as dispatch_router
from app.routers.flood_zones import router as flood_zones_router
from app.routers.photo_verification import router as photo_verification_router
from app.routers.replay import router as replay_router
from app.routers.report_translation import router as report_translation_router
from app.routers.risk import router as risk_router
from app.routers.simulation import router as simulation_router
from app.routers.sos import router as sos_router
from app.routers.speech_synthesis import router as speech_synthesis_router
from app.routers.ws import router as ws_router
from app.services.ws_manager import ws_manager

settings = get_settings()
logger = logging.getLogger(__name__)


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

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Converts any exception that escapes a route handler into a clean JSON 500.

    Without this, Starlette's default fallback (ServerErrorMiddleware) returns a plain-
    text response from OUTSIDE the CORS middleware, so the browser's fetch sees it as a
    blocked cross-origin response rather than a real 500 — the frontend then reports a
    generic network failure with no error message at all. Registering a handler here
    routes it through FastAPI's ExceptionMiddleware instead, which sits *inside*
    CORSMiddleware, so this JSON response gets CORS headers and the frontend can actually
    read and display `detail`.
    """
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "SurakshaGrid API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/healthz",
    }


app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(sos_router, prefix="/api/v1")
app.include_router(dispatch_router, prefix="/api/v1")
app.include_router(risk_router, prefix="/api/v1")
app.include_router(flood_zones_router, prefix="/api/v1")
app.include_router(replay_router, prefix="/api/v1")
app.include_router(simulation_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(photo_verification_router, prefix="/api")
app.include_router(audio_transcription_router, prefix="/api")
app.include_router(report_translation_router, prefix="/api")
app.include_router(speech_synthesis_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(ws_router)


