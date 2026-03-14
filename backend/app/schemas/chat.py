from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question: str

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be empty or whitespace")
        return v


class ChatMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: str
    content: str
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book_id: UUID
    messages: list[ChatMessage]