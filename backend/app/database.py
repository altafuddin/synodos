import os
from contextlib import asynccontextmanager
from datetime import datetime

import structlog
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

log = structlog.get_logger("synodos.db")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


class Book(Base):
    __tablename__ = "books"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    format = Column(String, nullable=False)          # 'epub' or 'pdf'
    total_units = Column(Integer, nullable=False)
    current_position = Column(String, nullable=True)
    current_progression = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_read_at = Column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(String, ForeignKey("books.id"), nullable=False, index=True)
    role = Column(String, nullable=False)            # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def get_db_context():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    # Must match the name SQLAlchemy generates for ChatMessage.book_id's
    # index=True, so a fresh DB (indexed by create_all) and an older one
    # (indexed by the statement below) converge on the same schema.
    index_name = "ix_chat_messages_book_id"
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all(checkfirst=True) emits no DDL for a table that already
        # exists, so an index added to the model never reaches a database
        # created before it. This idempotent statement backfills it and is a
        # genuine no-op once the index is present — safe to run on every boot.
        pre_exists = (
            await conn.execute(
                text(
                    "SELECT 1 FROM sqlite_master "
                    "WHERE type = 'index' AND name = :name"
                ),
                {"name": index_name},
            )
        ).scalar() is not None
        await conn.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {index_name} "
                "ON chat_messages (book_id)"
            )
        )
    if pre_exists:
        log.info("db_initialized")
    else:
        log.info("db_initialized", created_index=index_name)