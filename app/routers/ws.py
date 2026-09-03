import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live-feed")
async def websocket_live_feed(websocket: WebSocket) -> None:
    """Real-Time WebSocket channel emitting live updates for new reports, urgency shifts, and dispatch events."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive while listening for client messages (e.g. pings/pong)
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket message: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.warning(f"WebSocket client connection error: {exc}")
        ws_manager.disconnect(websocket)
