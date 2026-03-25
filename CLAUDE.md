# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project

Synodos — an AI-powered mobile book reader. Users pick EPUB or PDF books from their phone, the app copies the file to local storage and uploads it to the backend for parsing only (backend discards the original after extracting text). All reading happens locally. As the user scrolls, the frontend reports progress every 5% — the backend grows a per-book text buffer. When the user asks a question, the backend sends the buffer (everything read so far) + chat history to Gemini 2.5 Flash and streams the answer back. The AI only knows what the user has already read — no spoilers.

## Monorepo Structure
```
synodos/
├── backend/    ← FastAPI backend (complete — 28/28 tests passing)
└── frontend/   ← React Native + Expo (Phase 2 — active development)
```

## Backend Stack

- **Framework:** FastAPI
- **Database:** SQLite via SQLAlchemy (async) + aiosqlite
- **AI:** Google Gemini 2.5 Flash (`google-genai`)
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
- Node.js: v23.10.0

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
| POST | /api/books/epub | Upload + parse EPUB |
| POST | /api/books/pdf | Upload + parse PDF |
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

## Backend Build Approach (Complete)

Layered — one layer at a time, verified before proceeding:
1. Foundation — database.py, main.py, requirements.txt, server boots
2. Schemas — all Pydantic models
3. Parser service — EPUB + PDF parsing
4. Books router — all 5 book endpoints
5. Buffer service + progress router
6. Gemini service + chat router
7. Unit tests — 28/28 passing

---

## Frontend Stack

- **Framework:** React Native + Expo
- **Navigation:** Expo Router (file-based routing)
- **State management:** Zustand
- **UI components:** React Native Paper + custom dark/sepia/light theme
- **EPUB rendering:** `react-native-readium` (Readium Kotlin Toolkit — fully native Android engine)
- **PDF rendering:** `react-native-pdf` (native Android PdfRenderer)
- **Chat overlay:** `@gorhom/bottom-sheet` (half-screen draggable, snap points)
- **File picker:** `expo-document-picker`
- **File storage:** `expo-file-system`
- **Entry point:** `frontend/app/_layout.tsx`

## Frontend Folder Structure
```
frontend/
├── app.json                         ← Expo config (name, version, plugins)
├── eas.json                         ← EAS Build profiles (development, preview, production)
├── package.json
├── tsconfig.json
├── .env                             ← Backend URL (never committed)
├── .env.example
│
└── src/
    ├── app/                         ← Expo Router screens (file path = route)
    │   ├── _layout.tsx              ← Root layout — PaperProvider, GestureHandlerRootView, BottomSheetModalProvider
    │   ├── index.tsx                ← Library screen
    │   └── reader/
    │       └── [bookId].tsx         ← Reader screen + chat bottom sheet overlay
    │
    ├── components/
    │   ├── LibraryCard.tsx          ← Book card in library list
    │   ├── UploadModal.tsx          ← File picker + upload progress
    │   ├── ReaderEpub.tsx           ← EPUB renderer (react-native-readium)
    │   ├── ReaderPdf.tsx            ← PDF renderer (react-native-pdf)
    │   ├── ChatSheet.tsx            ← Bottom sheet chat overlay (@gorhom/bottom-sheet)
    │   ├── ChatMessage.tsx          ← Individual message bubble (user / assistant)
    │   └── ChatInput.tsx            ← Text input + send button inside the sheet
    │
    ├── stores/
    │   └── bookStore.ts             ← Zustand store — library, active book, theme, progress
    │
    ├── services/
    │   ├── api.ts                   ← Base fetch config, shared request helpers
    │   ├── books.ts                 ← uploadBook, listBooks, getBook, patchBook, deleteBook
    │   ├── progress.ts              ← reportProgress
    │   ├── chat.ts                  ← askQuestion (streaming), getChatHistory
    │   └── fileStorage.ts           ← expo-file-system: copy, read, delete local files
    │
    ├── hooks/
    │   ├── useReader.ts             ← Scroll tracking, progress reporting, position state
    │   └── useChat.ts               ← Chat state, message history, streaming handler
    │
    ├── constants/
    │   ├── api.ts                   ← Base URL config (emulator / device / production)
    │   └── themes.ts                ← Dark, sepia, and light theme definitions for RN Paper
    │
    └── types/
        └── index.ts                 ← Book, ChatMessage, ReadPositions, ApiResponse types
```

## Environment Variables (frontend/.env)
```
# Android emulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000

# Physical device on local network — replace with your machine's LAN IP
# EXPO_PUBLIC_API_URL=http://192.168.x.x:8000

# Production (Phase 3)
# EXPO_PUBLIC_API_URL=https://api.your-domain.com
```

## Frontend Commands
```bash
cd frontend
npm install                          # install dependencies
npx expo start --dev-client          # start dev server (requires custom dev build installed)
eas build --platform android --profile development  # build custom dev APK (one-time setup)
```

## Custom Dev Build (Required)

Three libraries require native compilation — they cannot run in Expo Go:
- `react-native-readium` — Readium Kotlin Toolkit (requires JDK 17)
- `react-native-pdf` — native Android PdfRenderer
- `@gorhom/bottom-sheet` — Reanimated + Gesture Handler

Build once with EAS, install the APK on device, then use `npx expo start --dev-client` for all development. Rebuild only when adding new native libraries or changing native config.

See TAD → Custom Dev Build Setup for full instructions.

## Frontend Build Layers

1. Foundation — Expo init, Expo Router, folder structure, RN Paper theme, API config, EAS custom dev build
2. Library screen — Zustand store, API service, book list UI
3. Upload flow — file picker, file system copy, POST to backend
4. EPUB reader — react-native-readium, chapter nav, progress reporting
5. PDF reader — react-native-pdf, page nav, progress reporting
6. Chat overlay — @gorhom/bottom-sheet, streaming consumer, history loading
7. Polish + integration — transitions, loading states, full end-to-end testing

## Frontend Key Design Rules

- **components/** are pure UI — props in, render out. No API calls inside components.
- **services/** is where all network and file system calls live. Never call `fetch` directly from a component.
- **hooks/** contains stateful behaviours that span components (reading, chat).
- **Zustand store** is the single source of truth for shared state — library list, active book, reading theme.
- **API base URL** always comes from `constants/api.ts` — never hardcoded elsewhere.
- **Progress reporting** fires at every 5% scroll threshold — `unit_id` (chapter id for EPUB, `page_N` for PDF) + `scroll_pct` (0–100 integer).
- **Chat streaming** consumes `text/event-stream` — render tokens as they arrive, handle `[DONE]` to re-enable input.
- **All book_id values** are UUID strings from the backend.