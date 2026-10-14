import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_db
from app.services.auth import verify_access_token

BEARER_PREFIX = "Bearer "
WWW_AUTHENTICATE = {"WWW-Authenticate": "Bearer"}


async def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> User:
    if authorization is None or not authorization.startswith(BEARER_PREFIX):
        raise HTTPException(
            401, "Missing or invalid authorization header", headers=WWW_AUTHENTICATE
        )

    token = authorization[len(BEARER_PREFIX):]
    try:
        user_id = verify_access_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token", headers=WWW_AUTHENTICATE)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(401, "User not found", headers=WWW_AUTHENTICATE)
    return user
