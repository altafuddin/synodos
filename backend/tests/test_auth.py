from datetime import datetime, timedelta

import jwt
import pytest
from sqlalchemy import func, select, text

from app.config import settings
from app.database import RefreshToken, User
from app.services.auth import (
    JWT_ALGORITHM,
    _hash_token,
    create_refresh_token,
    store_refresh_token,
    verify_access_token,
)


async def _sign_in(client, mock_google_verify, **profile):
    mock_google_verify(**profile)
    resp = await client.post("/api/auth/google", json={"id_token": "fake"})
    assert resp.status_code == 200
    return resp.json()


async def _refresh_token_count(db_session, user_id):
    return await db_session.scalar(
        select(func.count())
        .select_from(RefreshToken)
        .where(RefreshToken.user_id == user_id)
    )


@pytest.mark.asyncio
class TestGoogleSignIn:
    async def test_sign_in_creates_user(self, client, db_session, mock_google_verify):
        data = await _sign_in(client, mock_google_verify)

        assert data["access_token"]
        assert data["refresh_token"]
        assert data["token_type"] == "bearer"

        user = await db_session.scalar(
            select(User).where(User.google_sub == "test-sub-123")
        )
        assert user is not None
        assert user.email == "test@example.com"
        assert verify_access_token(data["access_token"]) == user.id

    async def test_sign_in_existing_user_returns_same_id(
        self, client, db_session, mock_google_verify
    ):
        first = await _sign_in(client, mock_google_verify)
        second = await _sign_in(client, mock_google_verify)

        assert verify_access_token(first["access_token"]) == verify_access_token(
            second["access_token"]
        )
        assert await db_session.scalar(select(func.count()).select_from(User)) == 1

    async def test_sign_in_updates_profile(self, client, db_session, mock_google_verify):
        await _sign_in(client, mock_google_verify)
        await _sign_in(
            client, mock_google_verify, email="new@example.com", name="New Name"
        )

        user = await db_session.scalar(
            select(User).where(User.google_sub == "test-sub-123")
        )
        assert user.email == "new@example.com"
        assert user.name == "New Name"

    async def test_invalid_google_token(self, client, monkeypatch):
        def reject(token):
            raise ValueError("Token used too late")

        monkeypatch.setattr("app.routers.auth.verify_google_token", reject)

        resp = await client.post("/api/auth/google", json={"id_token": "garbage"})
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestRefresh:
    async def test_refresh_returns_new_pair(self, client, db_session, mock_google_verify):
        tokens = await _sign_in(client, mock_google_verify)

        resp = await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert resp.status_code == 200
        new_tokens = resp.json()
        assert new_tokens["access_token"]
        assert new_tokens["refresh_token"] != tokens["refresh_token"]

        old = await db_session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == _hash_token(tokens["refresh_token"])
            )
        )
        assert old.used is True

    async def test_reused_refresh_token_rejected_and_all_revoked(
        self, client, db_session, mock_google_verify
    ):
        tokens = await _sign_in(client, mock_google_verify)
        user_id = verify_access_token(tokens["access_token"])

        first = await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert first.status_code == 200

        reuse = await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert reuse.status_code == 401
        assert await _refresh_token_count(db_session, user_id) == 0

    async def test_expired_refresh_token_rejected(self, client, db_session, create_user):
        user = await create_user()
        raw, token_hash = create_refresh_token()
        await store_refresh_token(db_session, user.id, token_hash)
        token = await db_session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        token.expires_at = datetime.utcnow() - timedelta(days=1)
        await db_session.commit()

        resp = await client.post("/api/auth/refresh", json={"refresh_token": raw})
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestMe:
    async def test_me_returns_user(self, client, create_user, auth_headers):
        user = await create_user()

        resp = await client.get("/api/auth/me", headers=auth_headers(user.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == user.id
        assert data["email"] == user.email
        assert data["name"] == user.name

    async def test_me_no_token(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
        assert resp.headers["WWW-Authenticate"] == "Bearer"

    async def test_me_invalid_token(self, client):
        resp = await client.get(
            "/api/auth/me", headers={"Authorization": "Bearer garbage"}
        )
        assert resp.status_code == 401

    async def test_me_expired_token(self, client, create_user):
        user = await create_user()
        expired = jwt.encode(
            {
                "sub": user.id,
                "type": "access",
                "exp": datetime.utcnow() - timedelta(minutes=1),
            },
            settings.JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )

        resp = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {expired}"}
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestLogout:
    async def test_logout_revokes_all_tokens(self, client, mock_google_verify):
        tokens = await _sign_in(client, mock_google_verify)
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        resp = await client.post("/api/auth/logout", headers=headers)
        assert resp.status_code == 200

        refresh = await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert refresh.status_code == 401


@pytest.mark.asyncio
class TestDeleteAccount:
    async def test_delete_removes_user_and_tokens(
        self, client, db_session, mock_google_verify
    ):
        tokens = await _sign_in(client, mock_google_verify)
        user_id = verify_access_token(tokens["access_token"])
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        resp = await client.delete("/api/auth/me", headers=headers)
        assert resp.status_code == 200

        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 401
        assert me.json()["detail"] == "User not found"

        assert await db_session.scalar(select(User).where(User.id == user_id)) is None

    async def test_delete_cascades_refresh_tokens(
        self, client, db_session, mock_google_verify
    ):
        tokens = await _sign_in(client, mock_google_verify)
        user_id = verify_access_token(tokens["access_token"])
        assert await _refresh_token_count(db_session, user_id) == 1

        resp = await client.delete(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert resp.status_code == 200
        assert await _refresh_token_count(db_session, user_id) == 0

    async def test_fk_cascade_deletes_tokens(self, db_session):
        # Raw SQL bypasses the ORM relationship cascade, so only the database's
        # ON DELETE CASCADE (live only with PRAGMA foreign_keys=ON) can remove
        # the token row.
        await db_session.execute(
            text(
                "INSERT INTO users (id, google_sub, email) "
                "VALUES ('fk-user', 'fk-sub', 'fk@example.com')"
            )
        )
        await db_session.execute(
            text(
                "INSERT INTO refresh_tokens (id, token_hash, user_id, expires_at) "
                "VALUES ('fk-token', 'fk-hash', 'fk-user', '2099-01-01 00:00:00')"
            )
        )
        await db_session.execute(text("DELETE FROM users WHERE id = 'fk-user'"))

        remaining = await db_session.scalar(
            text("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = 'fk-user'")
        )
        assert remaining == 0
