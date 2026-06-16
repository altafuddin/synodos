"""Logging foundation for Synodos.

structlog is only the *call-site* layer here: every record — whether it comes
from `structlog.get_logger(...)` or from a plain stdlib logger inside uvicorn /
sqlalchemy — is rendered by the SAME stdlib handlers via
`structlog.stdlib.ProcessorFormatter`. That gives one consistent, timestamped,
request_id-carrying line per event in both the console and the rotating file.
"""

import logging
import logging.handlers
import os
import sys

import structlog

# Resolve backend/logs/ relative to this file (app/ -> backend/), never hardcoded
# to a CWD that depends on where uvicorn was launched.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(_BACKEND_DIR, "logs")


def setup_logging() -> None:
    """Configure structlog + stdlib once, at process start."""
    os.makedirs(LOG_DIR, exist_ok=True)
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    # Processors applied to BOTH structlog records (before handoff) and, via
    # foreign_pre_chain, to foreign stdlib records — so a uvicorn line gets the
    # same level/timestamp/request_id treatment as an app line.
    shared_processors = [
        structlog.contextvars.merge_contextvars,  # injects bound request_id
        structlog.stdlib.add_logger_name,  # renders logger=synodos.<comp>
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
    ]

    # structlog side: run shared processors, then package the event dict for the
    # stdlib ProcessorFormatter. wrap_for_formatter MUST be last.
    structlog.configure(
        processors=shared_processors
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Two formatters, same readable layout — color only on the console.
    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
    )
    file_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=False),
        ],
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)

    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"),
        maxBytes=5 * 1024 * 1024,  # ~5 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(file_formatter)

    # Attach both handlers to the ROOT logger so every logger that propagates
    # ends up here exactly once.
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(log_level)
    root.addHandler(console_handler)
    root.addHandler(file_handler)

    # Strip uvicorn/sqlalchemy of their own handlers and let them propagate to
    # root — otherwise uvicorn double-prints (its handler + ours).
    for name in (
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "sqlalchemy",
        "sqlalchemy.engine",
        "aiosqlite",
    ):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
        # Lift these to WARNING (don't disable) so genuine warnings/errors still
        # surface, while their noisy/sensitive DEBUG/INFO output never reaches the
        # handlers even when root is DEBUG:
        #   - uvicorn.access: redundant with our synodos.request line.
        #   - aiosqlite / sqlalchemy.engine: echo raw SQL with bound parameters,
        #     which would leak question/answer/buffer text (no-content rule).
        if name in ("uvicorn.access", "aiosqlite", "sqlalchemy.engine"):
            lg.setLevel(logging.WARNING)
