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