from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings, get_settings
from app.core.deps import get_current_officer
from app.core.security import create_access_token
from app.db.session import get_db
from app.main import app

settings = get_settings()


@pytest.mark.asyncio
async def test_auth_login_success():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/auth/login",
            json={"username": settings.ADMIN_USERNAME, "password": "test-password-123"},
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_auth_login_form_success():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/auth/login",
            data={"username": settings.ADMIN_USERNAME, "password": "test-password-123"},
        )


    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_auth_login_invalid_credentials():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/auth/login",
            json={"username": "wronguser", "password": "wrongpassword"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_auth_login_wrong_password_correct_username():
    """Correct username, wrong password must still be rejected — this is the exact case

    a naive `password == settings.ADMIN_PASSWORD` comparison (comparing a plaintext
    request password against the bcrypt hash) would get right by accident only when the
    attacker guesses the literal hash string; verify_password's bcrypt.checkpw is what
    actually has to reject this.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/auth/login",
            json={"username": settings.ADMIN_USERNAME, "password": "definitely-wrong-password"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_auth_login_wrong_username_correct_password():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/auth/login",
            json={"username": "not-the-admin", "password": "test-password-123"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_settings_requires_admin_password(monkeypatch):
    """ADMIN_PASSWORD has no default (Field(...)) — booting without it must fail loudly

    (a configuration error) rather than the app silently starting with no admin password
    to check logins against.
    """
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with pytest.raises(ValidationError, match="ADMIN_PASSWORD"):
        Settings(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.asyncio
async def test_guarded_endpoint_unauthorized():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/v1/dispatch/run")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_guarded_endpoint_invalid_jwt_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/dispatch/run",
            headers={"Authorization": "Bearer this-is-not-a-valid-jwt"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_guarded_endpoint_valid_jwt_allowed():
    """A JWT obtained from a real /auth/login must be accepted end-to-end by a protected

    route (not just by the get_current_officer dependency in isolation) — get_current_officer
    itself is exercised for real here, only the DB layer underneath is mocked (empty
    pending-reports/available-units result sets) so the test doesn't need a live Postgres.
    """
    mock_db = AsyncMock()
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result_empty

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            login_response = await ac.post(
                "/api/v1/auth/login",
                json={"username": settings.ADMIN_USERNAME, "password": "test-password-123"},
            )
            assert login_response.status_code == status.HTTP_200_OK
            token = login_response.json()["access_token"]

            response = await ac.post(
                "/api/v1/dispatch/run",
                headers={"Authorization": f"Bearer {token}"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_current_officer_accepts_valid_token():
    token = create_access_token(data={"sub": settings.ADMIN_USERNAME, "role": "officer"})

    class _FakeCredentials:
        credentials = token

    payload = await get_current_officer(_FakeCredentials())  # type: ignore[arg-type]
    assert payload["sub"] == settings.ADMIN_USERNAME
    assert payload["role"] == "officer"


@pytest.mark.asyncio
async def test_get_current_officer_rejects_tampered_token():
    from fastapi import HTTPException

    class _FakeCredentials:
        credentials = "not-a-real-jwt-at-all"

    with pytest.raises(HTTPException) as exc_info:
        await get_current_officer(_FakeCredentials())  # type: ignore[arg-type]
    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

