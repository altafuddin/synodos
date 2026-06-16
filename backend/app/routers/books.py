import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
import structlog
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Book, ChatMessage, get_db
from app.schemas.books import (
    BookDeleteResponse,
    BookDetail,
    BookListItem,
    BookPatch,
    BookUploadResponse,
)
from app.services.parser import parse_book

load_dotenv()
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")

router = APIRouter(prefix="/api/books", tags=["books"])
log = structlog.get_logger("synodos.books")


@router.post("", status_code=201, response_model=BookUploadResponse)
async def upload_book(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    max_size = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50")) * 1024 * 1024
    file_bytes = await file.read()
    log.info("book_upload_received", filename=file.filename, size_bytes=len(file_bytes))

    if len(file_bytes) > max_size:
        log.warning(
            "book_upload_rejected",
            reason="too_large",
            size_bytes=len(file_bytes),
            max_bytes=max_size,
        )
        raise HTTPException(status_code=413, detail="File exceeds maximum upload size")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".epub", ".pdf"):
        log.warning("book_upload_rejected", reason="unsupported_format", suffix=suffix)
        raise HTTPException(status_code=400, detail="Unsupported format")

    try:
        manifest, title, author, fmt = await asyncio.to_thread(
            parse_book, file_bytes, file.filename
        )
    except ValueError as e:
        log.warning("book_parse_failed", filename=file.filename, error=str(e))
        raise HTTPException(status_code=400, detail=str(e))

    book_id = str(uuid.uuid4())
    book_dir = Path(STORAGE_PATH) / "books" / book_id
    book_dir.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(book_dir / "manifest.json", "w") as f:
        await f.write(json.dumps(manifest))

    async with aiofiles.open(book_dir / "buffer.txt", "w") as f:
        await f.write("")

    async with aiofiles.open(book_dir / "read_positions.json", "w") as f:
        await f.write(json.dumps({}))

    now = datetime.utcnow()
    book = Book(
        id=book_id,
        title=title,
        author=author,
        format=fmt,
        total_units=len(manifest),
        uploaded_at=now,
    )
    db.add(book)
    await db.commit()
    await db.refresh(book)

    log.info(
        "book_uploaded",
        book_id=book.id,
        format=book.format,
        title=book.title,
        unit_count=len(manifest),
        total_chars=sum(item["char_count"] for item in manifest),
    )

    return BookUploadResponse(
        book_id=book.id,
        title=book.title,
        author=book.author,
        format=book.format,
        total_units=book.total_units,
        uploaded_at=book.uploaded_at,
    )


@router.get("", response_model=list[BookListItem])
async def list_books(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Book).order_by(
            Book.last_read_at.desc().nulls_last(),
            Book.uploaded_at.desc(),
        )
    )
    books = result.scalars().all()

    log.debug("books_listed", count=len(books))

    return [
        BookListItem(
            book_id=b.id,
            title=b.title,
            author=b.author,
            format=b.format,
            total_units=b.total_units,
            uploaded_at=b.uploaded_at,
            last_read_at=b.last_read_at,
        )
        for b in books
    ]


@router.get("/{book_id}", response_model=BookDetail)
async def get_book(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="get")
        raise HTTPException(status_code=404, detail="Book not found")

    positions_path = Path(STORAGE_PATH) / "books" / book_id / "read_positions.json"
    async with aiofiles.open(positions_path, "r") as f:
        read_positions = json.loads(await f.read())

    return BookDetail(
        book_id=book.id,
        title=book.title,
        author=book.author,
        format=book.format,
        total_units=book.total_units,
        current_position=book.current_position,
        current_progression=book.current_progression,
        read_positions=read_positions,
        uploaded_at=book.uploaded_at,
        last_read_at=book.last_read_at,
    )


@router.patch("/{book_id}", response_model=BookDetail)
async def update_book(
    book_id: str,
    patch: BookPatch,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="patch")
        raise HTTPException(status_code=404, detail="Book not found")

    changed_fields = []
    if patch.title is not None:
        book.title = patch.title
        changed_fields.append("title")
    if patch.author is not None:
        book.author = patch.author
        changed_fields.append("author")

    await db.commit()
    await db.refresh(book)

    log.info("book_updated", book_id=book_id, fields=changed_fields)

    positions_path = Path(STORAGE_PATH) / "books" / book_id / "read_positions.json"
    async with aiofiles.open(positions_path, "r") as f:
        read_positions = json.loads(await f.read())

    return BookDetail(
        book_id=book.id,
        title=book.title,
        author=book.author,
        format=book.format,
        total_units=book.total_units,
        current_position=book.current_position,
        current_progression=book.current_progression,
        read_positions=read_positions,
        uploaded_at=book.uploaded_at,
        last_read_at=book.last_read_at,
    )


@router.delete("/{book_id}", response_model=BookDeleteResponse)
async def delete_book(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="delete")
        raise HTTPException(status_code=404, detail="Book not found")

    book_dir = Path(STORAGE_PATH) / "books" / book_id
    if book_dir.exists():
        await asyncio.to_thread(shutil.rmtree, book_dir)

    await db.execute(delete(ChatMessage).where(ChatMessage.book_id == book_id))
    await db.delete(book)
    await db.commit()

    log.info("book_deleted", book_id=book_id)

    return BookDeleteResponse(deleted=True, book_id=book_id)