import hashlib
import secrets
from datetime import datetime, timedelta

import jwt
import structlog
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import RefreshToken, User

log = structlog.get_logger("synodos.auth")

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
JWT_ALGORITHM = "HS256"


def verify_google_token(token: str) -> dict:
    # Synchronous, and fetches Google's signing certs over the network on a
    # cache miss — call it from a threadpool, not directly in an async route.
    # Raises ValueError for an invalid, expired, or wrong-audience token.
    payload = id_token.verify_oauth2_token(
        token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
    )
    if payload.get("iss") not in GOOGLE_ISSUERS:
        raise ValueError(f"Wrong issuer: {payload.get('iss')}")
    return payload


async def get_or_create_user(db: AsyncSession, google_payload: dict) -> User:
    result = await db.execute(
        select(User).where(User.google_sub == google_payload["sub"])
    )
    user = result.scalar_one_or_none()

    if user is not None:
        # Google profile fields can change between sign-ins.
        user.email = google_payload["email"]
        user.name = google_payload.get("name")
        return user

    user = User(
        google_sub=google_payload["sub"],
        email=google_payload["email"],
        name=google_payload.get("name"),
    )
    db.add(user)
    await db.flush()
    log.info("user_created", user_id=user.id)
    return user


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.utcnow()
        + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> str:
    # Raises jwt.InvalidTokenError (incl. ExpiredSignatureError) on failure.
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Not an access token")
    return payload["sub"]


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_refresh_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(64)
    return raw_token, _hash_token(raw_token)


async def store_refresh_token(db: AsyncSession, user_id: str, token_hash: str) -> None:
    db.add(
        RefreshToken(
            token_hash=token_hash,
            user_id=user_id,
            expires_at=datetime.utcnow()
            + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        )
    )


async def rotate_refresh_token(
    db: AsyncSession, raw_token: str
) -> tuple[User, str, str]:
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == _hash_token(raw_token))
        .options(selectinload(RefreshToken.user))
    )
    token = result.scalar_one_or_none()

    if token is None:
        raise ValueError("Refresh token not found")
    if token.used:
        # A used token coming back means it was likely stolen: revoke every
        # session for the user. Committed here, unlike the rest of this
        # module, because the raise below means the caller never commits.
        log.warning("refresh_token_reused", user_id=token.user_id)
        await revoke_all_refresh_tokens(db, token.user_id)
        await db.commit()
        raise ValueError("Refresh token already used")
    if token.expires_at < datetime.utcnow():
        raise ValueError("Refresh token expired")

    token.used = True
    new_raw_token, new_token_hash = create_refresh_token()
    await store_refresh_token(db, token.user_id, new_token_hash)
    return token.user, new_raw_token, new_token_hash


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
