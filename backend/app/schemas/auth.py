from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GoogleSignInRequest(BaseModel):
    id_token: str                                    # Google ID token from the mobile client


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None
    created_at: datetime
    updated_at: datetime
