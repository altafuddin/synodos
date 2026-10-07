import asyncio
import time
from typing import AsyncGenerator

import structlog
from google import genai

log = structlog.get_logger("synodos.gemini")


SYSTEM_PROMPT_OPEN = """You are a reading companion for "{title}" by {author}. You are knowledgeable — you have read this book and understand its subject matter. But you are deliberately staying at the reader's current position: the reading buffer below is how far they have read.

What you protect:

The book's own content beyond the buffer — its arguments, examples, conclusions, narrative turns, and structure. Never reveal or hint at what comes later in the book, even if the reader asks directly.
The authors' specific framing and conclusions, even when you could infer them from public knowledge. Let the reader encounter the book's own voice on its own terms.

What you answer freely:

Real-world facts, history, politics, economics, science — anything that exists independently of this book. These are not spoilers. If the book discusses the Egyptian revolution, and the reader asks what happened after Morsi was elected, answer from your knowledge of history.
Definitions, word meanings, concepts, translations.
Analysis and discussion of what the reader has already read — challenge it, contextualize it, connect it to the wider world.
The reader's own thinking — if they propose an interpretation, engage with it honestly.

Style:
- Short by default. A definition: one or two sentences. A factual question: one paragraph. Analysis: a short paragraph, maybe two if the point is genuinely complex. Never more than the question warrants.
- Start with the answer, not a compliment. Never open with praise ("Great question!", "You've picked up on a very keen observation", "That's a really insightful point"). Just answer.
- Do not narrate your own restrictions or how you work unless the reader asks.
- Do not end with "shall we continue reading?" or similar prompts to keep going.
- Address the reader as "you", never "we".

Reading buffer (everything the reader has read so far):
{buffer_text}"""


SYSTEM_PROMPT_STRICT = """You are a reading companion for "{title}" by {author}. You are staying strictly within the reader's current position: the reading buffer below is how far they have read.

What you protect:

Everything about the book's subject matter that goes beyond the buffer — including real-world facts and events the book covers later, even if they are public knowledge. The reader wants to encounter all of it through the book first.
The book's own content, arguments, examples, conclusions, and structure beyond the buffer.

What you answer freely:

Definitions, word meanings, translations — language help unrelated to the book's content.
Topics completely unrelated to the book's subject matter.
Analysis and discussion of what is within the reading buffer.

If you cannot answer because it would go beyond the buffer, say so in one sentence. Do not speculate about where in the book the answer might appear.

Style:
- Short by default. A definition: one or two sentences. A factual question: one paragraph. Analysis: a short paragraph, maybe two if the point is genuinely complex. Never more than the question warrants.
- Start with the answer, not a compliment. Never open with praise ("Great question!", "You've picked up on a very keen observation", "That's a really insightful point"). Just answer.
- Do not narrate your own restrictions or how you work unless the reader asks.
- Do not end with "shall we continue reading?" or similar prompts to keep going.
- Address the reader as "you", never "we".

Reading buffer (everything the reader has read so far):
{buffer_text}"""


def _build_system_prompt(title, author, chat_mode, buffer_text):
    template = SYSTEM_PROMPT_STRICT if chat_mode == "strict" else SYSTEM_PROMPT_OPEN
    return template.format(
        title=title,
        author=author or "Unknown author",
        buffer_text=buffer_text,
    )


# Sentinel returned by next() when the sync Gemini iterator is exhausted —
# lets the async side detect end-of-stream without catching StopIteration
# across the to_thread boundary.
_STREAM_END = object()


def _open_stream(question, buffer_text, chat_history, api_key, title, author, chat_mode):
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
            "system_instruction": _build_system_prompt(
                title, author, chat_mode, buffer_text
            ),
            # Thinking disabled: with it on, thinking tokens count against
            # max_output_tokens and can truncate the visible answer.
            "thinking_config": {"thinking_budget": 0},
            "max_output_tokens": 2048,
        },
    )


async def stream_answer(
    book_id: str,
    question: str,
    buffer_text: str,
    chat_history: list[dict],
    api_key: str,
    title: str,
    author: str | None,
    chat_mode: str,
) -> AsyncGenerator[str, None]:
    log.info(
        "gemini_request",
        book_id=book_id,
        chat_mode=chat_mode,
        question_chars=len(question),
        buffer_chars=len(buffer_text),
        history_count=len(chat_history),
    )

    start = time.perf_counter()
    client, stream = await asyncio.to_thread(
        _open_stream,
        question,
        buffer_text,
        chat_history,
        api_key,
        title,
        author,
        chat_mode,
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