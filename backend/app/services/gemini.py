import asyncio
import time
from typing import AsyncGenerator

import structlog
from google import genai

log = structlog.get_logger("synodos.gemini")


SYSTEM_PROMPT = """You are a reading assistant for a book reader app. You only know what the user has read so far — the text provided below. Do not reference or speculate about anything beyond it. Answer questions helpfully and concisely based only on the reading buffer below.

Reading buffer:
{buffer_text}"""


# Sentinel returned by next() when the sync Gemini iterator is exhausted —
# lets the async side detect end-of-stream without catching StopIteration
# across the to_thread boundary.
_STREAM_END = object()


def _open_stream(question, buffer_text, chat_history, api_key):
    client = genai.Client(api_key=api_key)

    contents = list(chat_history)
    contents.append({"role": "user", "parts": [{"text": question}]})

    # The stream is lazy — the HTTP request fires on first next(). The client
    # must be returned alongside it: if it goes out of scope its finalizer
    # closes the underlying httpx client before iteration starts.
    return client, client.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config={
            "system_instruction": SYSTEM_PROMPT.format(buffer_text=buffer_text),
            "max_output_tokens": 1024,
        },
    )


async def stream_answer(
    book_id: str,
    question: str,
    buffer_text: str,
    chat_history: list[dict],
    api_key: str,
) -> AsyncGenerator[str, None]:
    log.info(
        "gemini_request",
        book_id=book_id,
        question_chars=len(question),
        buffer_chars=len(buffer_text),
        history_count=len(chat_history),
    )

    start = time.perf_counter()
    client, stream = await asyncio.to_thread(
        _open_stream, question, buffer_text, chat_history, api_key
    )
    iterator = iter(stream)

    chunk_count = 0
    answer_chars = 0
    while True:
        # One blocking next() per chunk — each token batch crosses the thread
        # boundary as Gemini produces it instead of after the full response.
        chunk = await asyncio.to_thread(next, iterator, _STREAM_END)
        if chunk is _STREAM_END:
            break
        if chunk.text:
            chunk_count += 1
            answer_chars += len(chunk.text)
            yield chunk.text

    log.info(
        "gemini_response",
        book_id=book_id,
        chunk_count=chunk_count,
        answer_chars=answer_chars,
        duration_ms=round((time.perf_counter() - start) * 1000, 2),
    )