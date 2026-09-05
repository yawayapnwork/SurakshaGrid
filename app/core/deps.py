from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.security import ALGORITHM

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


async def get_current_officer(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
) -> dict:
    """Dependency that verifies Bearer JWT token and returns authenticated officer payload."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Defense-in-depth: today /auth/login is the only token issuer and it always sets
        # role="officer" (see create_access_token call in app/routers/auth.py), so this
        # can't currently be triggered by a real login — but it stops a token minted with
        # a different role claim (present or future issuer) from passing as an officer.
        # 403, not 401: the credentials themselves are valid, they just lack this permission.
        role = payload.get("role")
        if role != "officer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token does not carry officer privileges",
            )
        return payload
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
