import os
from datetime import datetime, timezone

import structlog
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Book, get_db
from app.schemas.progress import ProgressRequest, ProgressResponse
from app.services.buffer import append_to_buffer

load_dotenv()
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")

router = APIRouter(prefix="/api/books", tags=["progress"])
log = structlog.get_logger("synodos.progress")


@router.post("/{book_id}/progress", response_model=ProgressResponse)
async def report_progress(
    book_id: str,
    request: ProgressRequest,
    db: AsyncSession = Depends(get_db),
):
    log.debug(
        "progress_received",
        book_id=book_id,
        unit_id=request.unit_id,
        scroll_pct=request.scroll_pct,
    )

    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="progress")
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        buffered = await append_to_buffer(
            book_id, request.unit_id, request.scroll_pct, STORAGE_PATH
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    book.last_read_at = datetime.now(timezone.utc)
    # Resume cursor — tracks where the user currently is, set unconditionally
    # (even on backward / non-advancing moves where append_to_buffer returned
    # False). Decoupled from the buffer's monotonic high-water mark by design.
    book.current_position = request.unit_id
    book.current_progression = request.scroll_pct
    await db.commit()

    return ProgressResponse(
        buffered=buffered,
        unit_id=request.unit_id,
        scroll_pct=request.scroll_pct,
    )