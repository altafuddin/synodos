from pydantic import BaseModel, ConfigDict, field_validator


class ProgressRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_id: str
    scroll_pct: int

    @field_validator("scroll_pct")
    @classmethod
    def scroll_pct_in_range(cls, v: int) -> int:
        if not (0 <= v <= 100):
            raise ValueError("scroll_pct must be between 0 and 100 inclusive")
        return v


class ProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    buffered: bool
    unit_id: str
    scroll_pct: int