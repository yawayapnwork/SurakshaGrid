import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.ws_manager import ConnectionManager


@pytest.mark.asyncio
async def test_connection_manager_in_memory_fallback():
    manager = ConnectionManager()
    assert len(manager.active_connections) == 0

    # Publish should not raise errors when no subscribers or no Redis
    await manager.publish("TEST_EVENT", {"key": "value"})


def test_websocket_live_feed_endpoint():
    client = TestClient(app)
    with client.websocket_connect("/ws/live-feed") as websocket:
        # Send text ping
        websocket.send_text("ping")
