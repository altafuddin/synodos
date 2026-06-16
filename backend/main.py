import os
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

import structlog

from app.logging_config import setup_logging

setup_logging()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers.books import router as books_router
from app.routers.progress import router as progress_router
from app.routers.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    storage_path = os.getenv("STORAGE_PATH", "./storage")
    os.makedirs(storage_path, exist_ok=True)
    yield


app = FastAPI(title="Synodos API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_request_log = structlog.get_logger("synodos.request")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Short id bound to contextvars so it rides on every log line emitted while
    # this request is handled — not just the summary line below.
    request_id = uuid4().hex[:8]
    structlog.contextvars.bind_contextvars(request_id=request_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        _request_log.info(
            "request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
    except Exception:
        # Capture unhandled 500s, then re-raise so FastAPI's handlers still run.
        _request_log.error(
            "request_failed",
            method=request.method,
            path=request.url.path,
            exc_info=True,
        )
        raise
    finally:
        # Always unbind so ids never leak into the next request on this worker.
        structlog.contextvars.clear_contextvars()


app.include_router(books_router)
app.include_router(progress_router)
app.include_router(chat_router)


@app.get("/")
async def health_check():
    return {"status": "ok", "app": "Synodos API"}