import os
import time
from datetime import datetime, timezone

import aiofiles
import structlog
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Book, ChatMessage, get_db, get_db_context
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessage as ChatMessageSchema,
    ChatRequest,
)
from app.services.gemini import stream_answer

load_dotenv()
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

router = APIRouter(prefix="/api/books", tags=["chat"])
log = structlog.get_logger("synodos.chat")


@router.post("/{book_id}/chat")
async def ask_question(
    book_id: str,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    log.info(
        "chat_request", book_id=book_id, question_chars=len(request.question)
    )

    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="chat")
        raise HTTPException(status_code=404, detail="Book not found")

    if not GEMINI_API_KEY:
        log.error("gemini_key_missing", book_id=book_id)
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    buffer_path = f"{STORAGE_PATH}/books/{book_id}/buffer.txt"
    try:
        async with aiofiles.open(buffer_path, "r") as f:
            buffer_text = await f.read()
        log.debug("chat_buffer_loaded", book_id=book_id, buffer_chars=len(buffer_text))
    except FileNotFoundError:
        log.warning("chat_buffer_missing", book_id=book_id)
        buffer_text = ""

    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history_rows = history_result.scalars().all()

    gemini_history = [
        {
            "role": "user" if msg.role == "user" else "model",
            "parts": [{"text": msg.content}],
        }
        for msg in history_rows
    ]
    log.debug(
        "chat_history_loaded", book_id=book_id, message_count=len(gemini_history)
    )

    async def generate():
        start = time.perf_counter()
        log.info(
            "chat_stream_start",
            book_id=book_id,
            buffer_chars=len(buffer_text),
            history_count=len(gemini_history),
        )
        full_response = []
        try:
            async for chunk in stream_answer(
                book_id, request.question, buffer_text, gemini_history, GEMINI_API_KEY
            ):
                full_response.append(chunk)
                yield f"data: {chunk}\n\n"
        except Exception:
            log.error("chat_stream_failed", book_id=book_id, exc_info=True)
            yield "data: [ERROR]\n\n"
            return

        answer = "".join(full_response)
        async with get_db_context() as session:
            now = datetime.now(timezone.utc)
            session.add(
                ChatMessage(
                    book_id=str(book_id),
                    role="user",
                    content=request.question,
                    created_at=now,
                )
            )
            session.add(
                ChatMessage(
                    book_id=str(book_id),
                    role="assistant",
                    content=answer,
                    created_at=now,
                )
            )
            await session.commit()
        log.info(
            "chat_completed",
            book_id=book_id,
            answer_chars=len(answer),
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/{book_id}/chat", response_model=ChatHistoryResponse)
async def get_chat_history(
    book_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        log.warning("book_not_found", book_id=book_id, op="history")
        raise HTTPException(status_code=404, detail="Book not found")

    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = history_result.scalars().all()

    log.debug("chat_history_returned", book_id=book_id, count=len(messages))

    return ChatHistoryResponse(
        book_id=book_id,
        messages=[
            ChatMessageSchema(
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at,
            )
            for msg in messages
        ],
    )