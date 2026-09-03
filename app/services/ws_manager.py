import asyncio
import json
import logging
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import get_settings

logger = logging.getLogger(__name__)

CHANNEL_NAME = "surakshagrid_events"


class ConnectionManager:
    """Manages active WebSocket client connections with Redis Pub/Sub support

    and an in-memory fallback manager.
    """

    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()
        self._redis_client: aioredis.Redis | None = None
        self._pubsub_task: asyncio.Task[None] | None = None

    async def connect(self, websocket: WebSocket) -> None:
        """Accepts an incoming WebSocket connection and adds it to active connections."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Removes a WebSocket connection from active connections."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast_in_memory(self, message: str | dict[str, Any]) -> None:
        """Broadcasts a JSON string or dict payload to all connected WebSocket clients."""
        if not self.active_connections:
            return

        payload_str = json.dumps(message) if isinstance(message, dict) else message

        disconnected: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload_str)
            except Exception as exc:
                logger.warning(f"Failed to send WebSocket message: {exc}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        """Publishes an event to Redis Pub/Sub if available, or directly broadcasts in-memory."""
        payload = {
            "event": event_type,
            "data": data,
        }
        payload_str = json.dumps(payload)

        published_to_redis = False
        try:
            settings = get_settings()
            if self._redis_client is None:
                self._redis_client = aioredis.from_url(
                    settings.REDIS_URL, decode_responses=True
                )
            await self._redis_client.publish(CHANNEL_NAME, payload_str)
            published_to_redis = True
        except Exception as exc:
            logger.debug(f"Redis publish unavailable ({exc}), broadcasting in-memory")

        # Fall back to in-memory broadcast if Redis publish failed or listener task isn't active
        if not published_to_redis or self._pubsub_task is None or self._pubsub_task.done():
            await self.broadcast_in_memory(payload)

    async def start_redis_listener(self) -> None:
        """Starts a background task to listen for Redis Pub/Sub events."""
        if self._pubsub_task and not self._pubsub_task.done():
            return

        try:
            settings = get_settings()
            if self._redis_client is None:
                self._redis_client = aioredis.from_url(
                    settings.REDIS_URL, decode_responses=True
                )
            pubsub = self._redis_client.pubsub()
            await pubsub.subscribe(CHANNEL_NAME)
            self._pubsub_task = asyncio.create_task(self._listen_pubsub(pubsub))
            logger.info("Redis Pub/Sub listener initialized")
        except Exception as exc:
            logger.warning(f"Could not start Redis Pub/Sub listener: {exc}. Using in-memory fallback.")

    async def _listen_pubsub(self, pubsub: Any) -> None:
        try:
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if data:
                        await self.broadcast_in_memory(data)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning(f"Redis Pub/Sub listener stopped with error: {exc}")

    async def stop(self) -> None:
        """Closes Redis Pub/Sub subscription and connection."""
        if self._pubsub_task:
            self._pubsub_task.cancel()
            self._pubsub_task = None
        if self._redis_client:
            try:
                await self._redis_client.close()
            except Exception:
                pass
            self._redis_client = None


ws_manager = ConnectionManager()
