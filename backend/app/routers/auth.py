import structlog
from fastapi import APIRouter, Depends, HTTPException
from google.auth.exceptions import TransportError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import User, get_db
from app.dependencies.auth import get_current_user
from app.schemas.auth import (
    GoogleSignInRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    get_or_create_user,
    revoke_all_refresh_tokens,
    rotate_refresh_token,
    store_refresh_token,
    verify_google_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = structlog.get_logger("synodos.auth")


@router.post("/google", response_model=TokenResponse)
async def google_sign_in(
    request: GoogleSignInRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = await run_in_threadpool(verify_google_token, request.id_token)
    except ValueError as e:
        log.warning("google_token_rejected", reason=str(e))
        raise HTTPException(status_code=401, detail="Invalid Google token")
    except TransportError as e:
        # Couldn't fetch Google's signing certs — the token may be fine.
        log.error("google_token_verify_unavailable", reason=str(e))
        raise HTTPException(
            status_code=503, detail="Unable to verify token — try again"
        )

    user = await get_or_create_user(db, payload)
    access_token = create_access_token(user.id)
    raw_refresh, refresh_hash = create_refresh_token()
    await store_refresh_token(db, user.id, refresh_hash)
    await db.commit()
    log.info("user_signed_in", user_id=user.id)
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        user, new_raw, _ = await rotate_refresh_token(db, request.refresh_token)
    except ValueError as e:
        log.warning("refresh_rejected", reason=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    access_token = create_access_token(user.id)
    await db.commit()
    return TokenResponse(access_token=access_token, refresh_token=new_raw)


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await revoke_all_refresh_tokens(db, current_user.id)
    await db.commit()
    log.info("user_logged_out", user_id=current_user.id)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.delete("/me")
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await revoke_all_refresh_tokens(db, current_user.id)
    await db.delete(current_user)
    await db.commit()
    log.info("user_deleted", user_id=current_user.id)
    return {"detail": "Account deleted"}
