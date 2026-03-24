import asyncio
from typing import AsyncGenerator

from google import genai


SYSTEM_PROMPT = """You are a reading assistant for a book reader app. You only know what the user has read so far — the text provided below. Do not reference or speculate about anything beyond it. Answer questions helpfully and concisely based only on the reading buffer below.

Reading buffer:
{buffer_text}"""


def _generate_sync(question, buffer_text, chat_history, api_key):
    client = genai.Client(api_key=api_key)

    contents = list(chat_history)
    contents.append({"role": "user", "parts": [{"text": question}]})

    response = client.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config={
            "system_instruction": SYSTEM_PROMPT.format(buffer_text=buffer_text),
            "max_output_tokens": 1024,
        },
    )

    chunks = []
    for chunk in response:
        if chunk.text:
            chunks.append(chunk.text)
    return chunks


async def stream_answer(
    book_id: str,
    question: str,
    buffer_text: str,
    chat_history: list[dict],
    api_key: str,
) -> AsyncGenerator[str, None]:
    chunks = await asyncio.to_thread(
        _generate_sync, question, buffer_text, chat_history, api_key
    )
    for chunk in chunks:
        yield chunk