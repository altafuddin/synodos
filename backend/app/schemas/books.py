from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class BookUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book_id: UUID
    title: str
    author: str | None
    format: Literal["epub", "pdf"]
    total_units: int
    uploaded_at: datetime


class BookListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book_id: UUID
    title: str
    author: str | None
    format: Literal["epub", "pdf"]
    total_units: int
    uploaded_at: datetime
    last_read_at: datetime | None


class BookDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book_id: UUID
    title: str
    author: str | None
    format: Literal["epub", "pdf"]
    total_units: int
    current_position: str | None
    read_positions: dict[str, int]
    uploaded_at: datetime
    last_read_at: datetime | None


class BookPatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str | None = None
    author: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("title must not be blank")
        return v

    @model_validator(mode="after")
    def at_least_one_field(self) -> "BookPatch":
        if self.title is None and self.author is None:
            raise ValueError("at least one of title or author must be provided")
        return self


class BookDeleteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    deleted: bool
    book_id: UUID