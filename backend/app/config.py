"""Single source of configuration for the backend.

Every environment variable is read once, here, at import time. Other modules
import `settings` instead of calling os.getenv or load_dotenv themselves.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set (see .env.example)")
    return value


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str
    STORAGE_PATH: str
    MAX_UPLOAD_SIZE_MB: int
    GEMINI_API_KEY: str
    LOG_LEVEL: str
    ENVIRONMENT: str
    GOOGLE_CLIENT_ID: str
    JWT_SECRET: str
    ACCESS_TOKEN_TTL_MINUTES: int
    REFRESH_TOKEN_TTL_DAYS: int


settings = Settings(
    DATABASE_URL=os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db"),
    STORAGE_PATH=os.getenv("STORAGE_PATH", "./storage"),
    MAX_UPLOAD_SIZE_MB=int(os.getenv("MAX_UPLOAD_SIZE_MB", "50")),
    GEMINI_API_KEY=_require("GEMINI_API_KEY"),
    LOG_LEVEL=os.getenv("LOG_LEVEL", "INFO"),
    ENVIRONMENT=os.getenv("ENVIRONMENT", ""),
    GOOGLE_CLIENT_ID=_require("GOOGLE_CLIENT_ID"),
    JWT_SECRET=_require("JWT_SECRET"),
    ACCESS_TOKEN_TTL_MINUTES=int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "15")),
    REFRESH_TOKEN_TTL_DAYS=int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "30")),
)
