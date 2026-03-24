import os
from datetime import datetime, timezone

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


@router.post("/{book_id}/progress", response_model=ProgressResponse)
async def report_progress(
    book_id: str,
    request: ProgressRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        buffered = await append_to_buffer(
            book_id, request.unit_id, request.scroll_pct, STORAGE_PATH
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    book.last_read_at = datetime.now(timezone.utc)
    await db.commit()

    return ProgressResponse(
        buffered=buffered,
        unit_id=request.unit_id,
        scroll_pct=request.scroll_pct,
    )