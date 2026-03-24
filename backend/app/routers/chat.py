import os
from datetime import datetime, timezone

import aiofiles
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


@router.post("/{book_id}/chat")
async def ask_question(
    book_id: str,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    buffer_path = f"{STORAGE_PATH}/books/{book_id}/buffer.txt"
    try:
        async with aiofiles.open(buffer_path, "r") as f:
            buffer_text = await f.read()
    except FileNotFoundError:
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

    async def generate():
        full_response = []
        try:
            async for chunk in stream_answer(
                book_id, request.question, buffer_text, gemini_history, GEMINI_API_KEY
            ):
                full_response.append(chunk)
                yield f"data: {chunk}\n\n"
        except Exception:
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
        raise HTTPException(status_code=404, detail="Book not found")

    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = history_result.scalars().all()

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