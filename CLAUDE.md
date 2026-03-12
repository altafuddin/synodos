# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project

Synodos — an AI-powered mobile book reader. Users pick EPUB or PDF books from their phone, the app copies the file to local storage and uploads it to the backend for parsing only (backend discards the original after extracting text). All reading happens locally. As the user scrolls, the frontend reports progress every 5% — the backend grows a per-book text buffer. When the user asks a question, the backend sends the buffer (everything read so far) + chat history to Gemini 2.5 Flash and streams the answer back. The AI only knows what the user has already read — no spoilers.

## Monorepo Structure
```
synodos/
├── backend/    ← FastAPI backend (active development)
└── frontend/   ← React Native + Expo (deferred — not started yet)
```

## Backend Stack

- **Framework:** FastAPI
- **Database:** SQLite via SQLAlchemy (async) + aiosqlite
- **AI:** Google Gemini 2.5 Flash (`google-generativeai`)
- **Parsing:** ebooklib (EPUB), PyMuPDF/fitz (PDF)
- **Entry point:** `backend/main.py`
- **Server:** `uvicorn main:app --reload` (run from inside `backend/`)

## Backend Folder Structure
```
backend/
├── main.py
├── requirements.txt
├── .env                        ← never committed
├── .env.example
├── app.db                      ← never committed
├── storage/books/{book_id}/    ← never committed
│   ├── manifest.json
│   ├── buffer.txt
│   └── read_positions.json
└── app/
    ├── database.py
    ├── routers/
    │   ├── books.py
    │   ├── progress.py
    │   └── chat.py
    ├── services/
    │   ├── parser.py
    │   ├── buffer.py
    │   └── gemini.py
    └── schemas/
        ├── books.py
        ├── progress.py
        └── chat.py
```

## Environment Variables (backend/.env)
```
GEMINI_API_KEY=
STORAGE_PATH=./storage
DATABASE_URL=sqlite+aiosqlite:///./app.db
MAX_UPLOAD_SIZE_MB=50
```

## Development Environment

- OS: Linux
- Python: Miniconda, env named `synodos`
- Activate: `conda activate synodos`
- Node.js: v23.10.0 (for Claude Code only — not used by backend)

## Backend Commands
```bash
conda activate synodos
cd backend
pip install -r requirements.txt   # install dependencies
uvicorn main:app --reload          # start dev server (default: localhost:8000)
```

## API Endpoints (8 total)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/books | Upload + parse book |
| GET | /api/books | List library |
| GET | /api/books/{book_id} | Book details + read positions |
| PATCH | /api/books/{book_id} | Edit title/author |
| DELETE | /api/books/{book_id} | Delete book + all data |
| POST | /api/books/{book_id}/progress | Report scroll % → grows buffer |
| POST | /api/books/{book_id}/chat | Ask AI (streaming) |
| GET | /api/books/{book_id}/chat | Load chat history |

## Key Design Rules

- **Routers** handle HTTP only — validate input, call a service, return response. No logic inside routers.
- **Services** contain all business logic — can be tested without running the HTTP server.
- **Buffer** is append-only. Content is never removed or reordered.
- **Gemini** is stateless — full context (buffer + chat history) is assembled and sent on every request.
- **Original book file** is never stored on the server — parsed in memory and discarded.
- **No authentication** — deferred to post-MVP.
- All file I/O must be async (aiofiles) or run in a threadpool executor.
- Storage path must always be read from the STORAGE_PATH env var, never hardcoded.

## Build Approach

Layered — one layer at a time, verified before proceeding:
1. Foundation — database.py, main.py, requirements.txt, server boots
2. Schemas — all Pydantic models
3. Parser service — EPUB + PDF parsing
4. Books router — all 5 book endpoints
5. Buffer service + progress router
6. Gemini service + chat router
