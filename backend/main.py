import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers.books import router as books_router


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


app.include_router(books_router)


@app.get("/")
async def health_check():
    return {"status": "ok", "app": "Synodos API"}