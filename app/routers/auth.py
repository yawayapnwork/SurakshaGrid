from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.security import create_access_token, verify_password

settings = get_settings()

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate dispatcher/admin officer and issue JWT access token",
)
async def login(
    request: Request,
) -> TokenResponse:
    """Authenticates admin/officer credentials from JSON body or OAuth2 form-data."""
    content_type = request.headers.get("content-type", "")

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        username = str(form.get("username") or "")
        password = str(form.get("password") or "")
    else:
        try:
            body = await request.json()
            if isinstance(body, dict):
                username = str(body.get("username") or "")
                password = str(body.get("password") or "")
            else:
                username = ""
                password = ""
        except Exception:
            username = ""
            password = ""

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required",
        )

    # Validate against configured admin credentials
    valid_username = username == settings.ADMIN_USERNAME
    valid_password = verify_password(password, settings.ADMIN_PASSWORD)

    if not valid_username or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": username, "role": "officer"})
    return TokenResponse(access_token=access_token, token_type="bearer")
