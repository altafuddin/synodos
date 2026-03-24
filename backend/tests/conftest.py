import json
import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db


@pytest.fixture(scope="session")
def epub_bytes():
    path = Path(__file__).parent / "fixtures" / "test.epub"
    return path.read_bytes()


@pytest.fixture(scope="session")
def pdf_bytes():
    path = Path(__file__).parent / "fixtures" / "test.pdf"
    return path.read_bytes()


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(tmp_path, db_session):
    storage_path = str(tmp_path / "storage")
    os.makedirs(storage_path, exist_ok=True)

    async def override_get_db():
        yield db_session

    # Patch STORAGE_PATH in all router modules before importing app
    import app.routers.books as books_mod
    import app.routers.progress as progress_mod
    import app.routers.chat as chat_mod

    orig_books = books_mod.STORAGE_PATH
    orig_progress = progress_mod.STORAGE_PATH
    orig_chat = chat_mod.STORAGE_PATH

    books_mod.STORAGE_PATH = storage_path
    progress_mod.STORAGE_PATH = storage_path
    chat_mod.STORAGE_PATH = storage_path

    from main import app

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    books_mod.STORAGE_PATH = orig_books
    progress_mod.STORAGE_PATH = orig_progress
    chat_mod.STORAGE_PATH = orig_chat


@pytest.fixture
def storage_path(tmp_path):
    sp = str(tmp_path / "storage")
    os.makedirs(sp, exist_ok=True)
    return sp


@pytest.fixture
def book_dir(storage_path):
    """Create a book directory with a synthetic manifest for buffer tests."""
    book_id = "test-book-001"
    bdir = Path(storage_path) / "books" / book_id
    bdir.mkdir(parents=True)

    manifest = [
        {
            "id": "ch1",
            "title": "Chapter 1",
            "text": "A" * 100,
            "char_count": 100,
        },
        {
            "id": "ch2",
            "title": "Chapter 2",
            "text": "B" * 200,
            "char_count": 200,
        },
    ]
    (bdir / "manifest.json").write_text(json.dumps(manifest))
    (bdir / "buffer.txt").write_text("")
    (bdir / "read_positions.json").write_text(json.dumps({}))

    return book_id, storage_path