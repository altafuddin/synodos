import json
from pathlib import Path

import pytest
import pytest_asyncio


@pytest.mark.asyncio
class TestHealthCheck:
    async def test_health_check(self, client):
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "app" in data


@pytest.mark.asyncio
class TestBookUpload:
    async def test_upload_epub(self, client, epub_bytes):
        resp = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["format"] == "epub"
        assert data["total_units"] > 0
        assert "book_id" in data

    async def test_upload_pdf(self, client, pdf_bytes):
        resp = await client.post(
            "/api/books",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["format"] == "pdf"
        assert data["total_units"] > 0

    async def test_upload_unsupported_format(self, client):
        resp = await client.post(
            "/api/books",
            files={"file": ("test.txt", b"hello", "text/plain")},
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
class TestBookList:
    async def test_empty_list(self, client):
        resp = await client.get("/api/books")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_after_uploads(self, client, epub_bytes, pdf_bytes):
        await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        await client.post(
            "/api/books",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
        )
        resp = await client.get("/api/books")
        assert resp.status_code == 200
        assert len(resp.json()) == 2


@pytest.mark.asyncio
class TestBookDetail:
    async def test_get_detail(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.get(f"/api/books/{book_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["book_id"] == book_id
        assert data["read_positions"] == {}

    async def test_get_unknown_id_returns_404(self, client):
        resp = await client.get("/api/books/nonexistent-id")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestBookPatch:
    async def test_patch_title(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.patch(
            f"/api/books/{book_id}",
            json={"title": "New Title"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "New Title"

    async def test_patch_blank_title_returns_422(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.patch(
            f"/api/books/{book_id}",
            json={"title": "   "},
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestBookDelete:
    async def test_delete_and_404(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.delete(f"/api/books/{book_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] is True
        assert data["book_id"] == book_id

        resp = await client.get(f"/api/books/{book_id}")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestProgress:
    async def test_progress_buffers(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        # Get first unit id from detail — we need the manifest
        detail = await client.get(f"/api/books/{book_id}")
        # Use a known unit from the epub; find via the upload total_units
        # Instead, read manifest from storage by posting progress with a known chapter
        # The epub fixture's first substantial chapter is at index 2 (heart-lamp-1)
        # We'll just try the first unit from the parser
        from app.services.parser import parse_book

        manifest, *_ = parse_book(epub_bytes, "test.epub")
        unit_id = manifest[0]["id"]

        resp = await client.post(
            f"/api/books/{book_id}/progress",
            json={"unit_id": unit_id, "scroll_pct": 50},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["buffered"] is True
        assert data["unit_id"] == unit_id
        assert data["scroll_pct"] == 50

    async def test_progress_invalid_scroll_pct(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.post(
            f"/api/books/{book_id}/progress",
            json={"unit_id": "ch1", "scroll_pct": 150},
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestChatHistory:
    async def test_empty_chat_history(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        book_id = upload.json()["book_id"]

        resp = await client.get(f"/api/books/{book_id}/chat")
        assert resp.status_code == 200
        data = resp.json()
        assert data["book_id"] == book_id
        assert data["messages"] == []


class TestChatStreamErrors:
    async def _upload(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        return upload.json()["book_id"]

    async def test_rate_limit_emits_error_frame(
        self, client, epub_bytes, monkeypatch
    ):
        from google.genai.errors import ClientError
        import app.routers.chat as chat_mod

        book_id = await self._upload(client, epub_bytes)

        monkeypatch.setattr(chat_mod, "GEMINI_API_KEY", "test-key")

        async def boom(*args, **kwargs):
            raise ClientError(
                429,
                {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}},
            )
            yield  # pragma: no cover — makes this an async generator

        monkeypatch.setattr(chat_mod, "stream_answer", boom)

        resp = await client.post(
            f"/api/books/{book_id}/chat", json={"question": "hi"}
        )
        assert resp.status_code == 200
        assert "data: [ERROR:rate_limit]" in resp.text
        assert "[DONE]" not in resp.text

    async def test_generic_exception_emits_unknown_frame(
        self, client, epub_bytes, monkeypatch
    ):
        import app.routers.chat as chat_mod

        book_id = await self._upload(client, epub_bytes)

        monkeypatch.setattr(chat_mod, "GEMINI_API_KEY", "test-key")

        async def boom(*args, **kwargs):
            raise RuntimeError("unexpected")
            yield  # pragma: no cover — makes this an async generator

        monkeypatch.setattr(chat_mod, "stream_answer", boom)

        resp = await client.post(
            f"/api/books/{book_id}/chat", json={"question": "hi"}
        )
        assert resp.status_code == 200
        assert "data: [ERROR:unknown]" in resp.text
        assert "[DONE]" not in resp.text

    async def test_user_turn_persisted_on_gemini_failure(
        self, client, epub_bytes, monkeypatch
    ):
        import app.routers.chat as chat_mod

        book_id = await self._upload(client, epub_bytes)

        monkeypatch.setattr(chat_mod, "GEMINI_API_KEY", "test-key")

        async def boom(*args, **kwargs):
            raise RuntimeError("unexpected")
            yield  # pragma: no cover — makes this an async generator

        monkeypatch.setattr(chat_mod, "stream_answer", boom)

        resp = await client.post(
            f"/api/books/{book_id}/chat", json={"question": "does she survive?"}
        )
        assert resp.status_code == 200
        assert "data: [ERROR:unknown]" in resp.text

        # The user turn must survive the failure; the assistant turn is lost.
        history = await client.get(f"/api/books/{book_id}/chat")
        messages = history.json()["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "does she survive?"


class TestChatHistoryLimits:
    async def _upload(self, client, epub_bytes):
        upload = await client.post(
            "/api/books",
            files={"file": ("test.epub", epub_bytes, "application/epub+zip")},
        )
        return upload.json()["book_id"]

    async def test_gemini_context_capped_to_last_20(
        self, client, db_session, epub_bytes, monkeypatch
    ):
        from datetime import datetime, timedelta
        from app.database import ChatMessage
        import app.routers.chat as chat_mod

        book_id = await self._upload(client, epub_bytes)

        base = datetime(2026, 1, 1, 12, 0, 0)
        for i in range(30):
            db_session.add(
                ChatMessage(
                    book_id=book_id,
                    role="user" if i % 2 == 0 else "assistant",
                    content=f"msg-{i}",
                    created_at=base + timedelta(seconds=i),
                )
            )
        await db_session.commit()

        monkeypatch.setattr(chat_mod, "GEMINI_API_KEY", "test-key")

        captured = {}

        async def capture(book_id, question, buffer_text, chat_history, api_key):
            captured["history"] = chat_history
            raise RuntimeError("stop after capture")
            yield  # pragma: no cover — makes this an async generator

        monkeypatch.setattr(chat_mod, "stream_answer", capture)

        await client.post(f"/api/books/{book_id}/chat", json={"question": "q"})

        history = captured["history"]
        assert len(history) == 20
        # The cap keeps the MOST RECENT 20 (msg-10 … msg-29), oldest first.
        assert history[0]["parts"][0]["text"] == "msg-10"
        assert history[-1]["parts"][0]["text"] == "msg-29"

    async def test_same_timestamp_rows_order_user_then_assistant(
        self, client, db_session, epub_bytes
    ):
        from datetime import datetime
        from app.database import ChatMessage

        book_id = await self._upload(client, epub_bytes)

        # Identical created_at — exactly what the old single-column ORDER BY
        # left unspecified. The id tiebreak must keep insertion order.
        ts = datetime(2026, 1, 1, 12, 0, 0)
        db_session.add(
            ChatMessage(book_id=book_id, role="user", content="q1", created_at=ts)
        )
        await db_session.flush()  # assigns id before the second insert
        db_session.add(
            ChatMessage(book_id=book_id, role="assistant", content="a1", created_at=ts)
        )
        await db_session.commit()

        resp = await client.get(f"/api/books/{book_id}/chat")
        messages = resp.json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert [m["content"] for m in messages] == ["q1", "a1"]