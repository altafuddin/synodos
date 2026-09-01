# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project

Synodos — an AI-powered mobile book reader. Users pick EPUB or PDF books from their phone, the app copies the file to local storage and uploads it to the backend for parsing only. The backend discards the original *file* after extraction, but keeps every unit's extracted text in `storage/books/{book_id}/manifest.json` (`id`, `title`, `text`, `char_count` per entry). All reading happens locally. As the user scrolls, the frontend reports progress every 5% — the backend grows a per-book append-only text buffer by cutting the newly-read slice out of that stored manifest text. When the user asks a question, the backend sends the buffer (everything read so far) + chat history to Gemini 2.5 Flash and streams the answer back. The AI only knows what the user has already read — no spoilers.

## Monorepo Structure
```
synodos/
├── backend/    ← FastAPI backend (complete — 33 tests in backend/tests/)
└── frontend/   ← React Native + Expo (active development)
```

## Backend Stack

- **Framework:** FastAPI
- **Database:** SQLite via SQLAlchemy (async) + aiosqlite
- **AI:** Google Gemini 2.5 Flash (`google-genai`)
- **Parsing:** ebooklib + beautifulsoup4 (EPUB — HTML text extraction), PyMuPDF/fitz (PDF)
- **Logging:** structlog — JSON structured logs, configured in `app/logging_config.py`, level from `LOG_LEVEL`
- **Entry point:** `backend/main.py`
- **Server:** `uvicorn main:app --reload` (run from inside `backend/`)

## Backend Folder Structure
```
backend/
├── main.py
├── requirements.txt
├── pyproject.toml                  ← pytest config (asyncio_mode, pythonpath, log_file)
├── .env                            ← never committed
├── .env.example
├── app.db                         ← never committed
├── logs/
│   └── app.log
├── storage/books/{book_id}/        ← never committed
│   ├── manifest.json
│   ├── buffer.txt
│   └── read_positions.json
├── app/
│   ├── database.py                 ← async engine, Book + ChatMessage models, get_db
│   ├── logging_config.py           ← structlog setup
│   ├── routers/
│   │   ├── books.py
│   │   ├── progress.py
│   │   └── chat.py
│   ├── services/
│   │   ├── parser.py
│   │   ├── buffer.py
│   │   └── gemini.py
│   └── schemas/
│       ├── books.py
│       ├── progress.py
│       └── chat.py
└── tests/
    ├── conftest.py
    ├── test_api.py
    ├── test_buffer.py
    └── test_parser.py
```

## Environment Variables (backend/.env)
```
GEMINI_API_KEY=
STORAGE_PATH=./storage
DATABASE_URL=sqlite+aiosqlite:///./app.db
MAX_UPLOAD_SIZE_MB=50
LOG_LEVEL=INFO          # DEBUG / INFO / WARNING / ERROR — read in app/logging_config.py
```

## Development Environment

- OS: macOS 26.6.2
- Python: Miniconda, env named `synodos`
- Activate: `conda activate synodos`
- Node.js: v22.23.2

## Backend Commands
```bash
conda activate synodos
cd backend
pip install -r requirements.txt   # install dependencies
uvicorn main:app --reload          # start dev server (default: localhost:8000)
```

## API Endpoints (8 total)

All routers mount at prefix `/api/books`.

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| POST | /api/books | Upload + parse (EPUB or PDF — format inferred from filename extension; multipart field name `file`) | 201 · `BookUploadResponse` |
| GET | /api/books | List library | `list[BookListItem]` |
| GET | /api/books/{book_id} | Book details + read positions | `BookDetail` |
| PATCH | /api/books/{book_id} | Edit title/author | `BookDetail` |
| DELETE | /api/books/{book_id} | Delete book + all data | 200 · `{deleted, book_id}` |
| POST | /api/books/{book_id}/progress | Report scroll % → grows buffer | `{buffered, unit_id, scroll_pct}` |
| POST | /api/books/{book_id}/chat | Ask AI (streaming) | `text/event-stream` — `data: {"token": ...}` frames, `[DONE]`, `[ERROR:<reason>]` |
| GET | /api/books/{book_id}/chat | Load chat history | `ChatHistoryResponse` `{book_id, messages}` |

## Key Design Rules

- **Routers** handle HTTP only — validate input, call a service, return response. No logic inside routers.
- **Services** contain all business logic — can be tested without running the HTTP server.
- **Buffer** is append-only. Content is never removed or reordered.
- **Gemini** is stateless — full context (buffer + chat history) is assembled and sent on every request.
- **Original book file** is never stored on the server — parsed in memory and the file discarded. The extracted text is *not* discarded: `manifest.json` retains every unit's full text (`id`, `title`, `text`, `char_count`), and the buffer slice is cut from that stored copy.
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
7. Unit tests — 33 tests across tests/test_api.py, test_buffer.py, test_parser.py

---

## Frontend Stack

- **Framework:** React Native + Expo
- **Navigation:** Expo Router (file-based routing)
- **State management:** Zustand
- **UI components:** React Native Paper + custom dark/sepia/light theme
- **EPUB rendering:** `react-native-readium` (Readium Kotlin Toolkit — fully native Android engine)
- **PDF rendering:** `react-native-pdf` (native Android PdfRenderer)
- **Chat overlay:** `@gorhom/bottom-sheet` (half-screen draggable, snap points) — built on `react-native-reanimated` + `react-native-worklets` + `react-native-gesture-handler`
- **Chat streaming:** `react-native-sse` — XHR-backed `EventSource` used in `services/chat.ts`; `fetch` cannot read `text/event-stream`
- **Markdown:** `react-native-markdown-display` — renders assistant chat bubbles in `components/ChatMessage.tsx`
- **Keyboard:** `react-native-keyboard-controller` — `KeyboardProvider` in `app/_layout.tsx`, drives the chat sheet's keyboard-tracking spacer in `components/ChatSheet.tsx`
- **OTA updates:** `expo-updates` + EAS Update — per-channel; update id surfaced on the Settings screen
- **Native peer deps (not imported directly in `src/`):** `react-native-nitro-modules` (required by `react-native-readium` v5), `react-native-blob-util` (required by `react-native-pdf`), `punycode` (Metro alias in `metro.config.js` for a Node builtin RN lacks)
- **Expo runtime deps (not imported directly in `src/`):** `expo-constants`, `expo-linking`, `expo-status-bar`
- **File picker:** `expo-document-picker`
- **File storage:** `expo-file-system`
- **Entry point:** `frontend/src/app/_layout.tsx` (resolved via `expo-router/entry`, package.json `main`)

## Frontend Folder Structure
```
frontend/
├── app.json                         ← static Expo config (base)
├── app.config.js                    ← dynamic config layered over app.json — per-APP_VARIANT identity (name, android.package, ios.bundleIdentifier, icon)
├── eas.json                         ← EAS Build profiles (development, preview, production) — each sets APP_VARIANT + EXPO_PUBLIC_API_URL + channel
├── metro.config.js                  ← punycode alias
├── babel.config.js
├── package.json
├── tsconfig.json
├── plugins/
│   ├── withReadiumDesugaring.js
│   └── withCleartextTraffic.js
├── .env                             ← Backend URL + log level (never committed)
├── .env.example
│
└── src/
    ├── app/                         ← Expo Router screens (file path = route)
    │   ├── _layout.tsx              ← Root layout — GestureHandlerRootView, KeyboardProvider, SafeAreaProvider, BottomSheetModalProvider, PaperProvider, themed Stack
    │   ├── index.tsx                ← Library screen (route /)
    │   ├── settings.tsx             ← Settings screen (route /settings) — API URL + OTA update id
    │   └── reader/
    │       └── [bookId].tsx         ← Reader screen + chat bottom sheet overlay (route /reader/[bookId])
    │
    ├── components/
    │   ├── LibraryCard.tsx          ← Book card in library list
    │   ├── UploadModal.tsx          ← File picker + upload progress
    │   ├── ReaderEpub.tsx           ← EPUB renderer (react-native-readium)
    │   ├── ReaderPdf.tsx            ← PDF renderer (react-native-pdf)
    │   ├── ChatSheet.tsx            ← Bottom sheet chat overlay (@gorhom/bottom-sheet)
    │   ├── ChatMessage.tsx          ← Individual message bubble (user / assistant, markdown)
    │   └── ChatInput.tsx            ← Text input + send button inside the sheet
    │
    ├── stores/
    │   └── bookStore.ts             ← Zustand store — library, active book, theme, progress
    │
    ├── services/
    │   ├── api.ts                   ← apiFetch<T> helper + ApiError
    │   ├── books.ts                 ← listBooks, uploadBook, getBook, deleteBook, patchBook
    │   ├── progress.ts              ← reportProgress
    │   ├── chat.ts                  ← getChatHistory, streamAnswer (SSE), StreamHandlers
    │   └── fileStorage.ts           ← getBookFileUri, saveBookFile, listLocalBookFiles, deleteBookFile
    │
    ├── hooks/
    │   ├── useReader.ts             ← Scroll tracking, progress reporting, position state
    │   └── useChat.ts               ← Chat state, message history, streaming handler
    │
    ├── constants/
    │   ├── api.ts                   ← Base URL (EXPO_PUBLIC_API_URL) + MAX_UPLOAD_SIZE_MB / _BYTES
    │   └── themes.ts                ← Dark, sepia, and light theme definitions for RN Paper
    │
    ├── utils/
    │   └── logger.ts                ← Tagged console + rotating on-device file log (Paths.document/logs/app.log), level from EXPO_PUBLIC_LOG_LEVEL
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

# Production
# EXPO_PUBLIC_API_URL=https://api.your-domain.com

# Log level: debug / info / warn / error — read in src/utils/logger.ts.
# Build-time inlined by Metro; restart Metro with --clear after changing.
# Defaults to debug in dev, warn otherwise.
EXPO_PUBLIC_LOG_LEVEL=debug
```
Per-profile values for both vars also live in `eas.json` under each build profile's `env` block.

## Frontend Commands
```bash
cd frontend
npm install                          # install dependencies
npm run dev                          # start dev server (APP_VARIANT=development expo start --dev-client)
npm run build:dev                    # EAS custom dev APK   (APP_VARIANT=development, profile development)
npm run build:preview                # EAS preview APK
npm run build:production             # EAS production APK
npm run update:preview               # EAS Update OTA push → preview channel
npm run update:production            # EAS Update OTA push → production channel
```

## Custom Dev Build (Required)

The project pulls in native modules that cannot run in Expo Go — a custom dev client is required. Native third-party libraries in `package.json`:
- `react-native-readium` — Readium Kotlin Toolkit (requires JDK 17); requires `react-native-nitro-modules` (native) for v5
- `react-native-pdf` — native Android PdfRenderer; requires `react-native-blob-util` (native)
- `@gorhom/bottom-sheet` — JS itself, but requires `react-native-reanimated` + `react-native-worklets` + `react-native-gesture-handler` (all native)
- `react-native-keyboard-controller` — native (chat sheet keyboard tracking)
- native support libs also present: `react-native-screens`, `react-native-safe-area-context`, `react-native-vector-icons`, and `expo-dev-client`

Build once with EAS, install the APK on device, then use `npx expo start --dev-client` for all development. Rebuild only when adding new native libraries or changing native config.

See TAD → Custom Dev Build Setup for full instructions.

## Config Plugins

Two custom plugins live in frontend/plugins/ — do not use expo-build-properties for these, it silently ignores some options:
- withReadiumDesugaring.js — enables core library desugaring (coreLibraryDesugaringEnabled + desugar_jdk_libs:2.1.2) and pins kotlinx-datetime to 0.6.1 via a top-level resolutionStrategy.force block (forcing both the base and -jvm coordinates) — required by Readium Kotlin Toolkit v3
- withCleartextTraffic.js — Android HTTP cleartext for local dev

Both use the withAppBuildGradle/withAndroidManifest pattern.

- **Downgrading a transitive native dependency requires `resolutionStrategy.force`, not `implementation`.** A plain `implementation("group:name:version")` only adds a candidate to the dependency graph — when a transitive dependency requests a higher version, Gradle's default highest-version-wins resolution still picks the higher one. Use `configurations.all { resolutionStrategy { force "..." } }` (or a `strictly` constraint) to override conflict resolution unconditionally. For Android, force both the base coordinate and the `-jvm` platform variant. Established fixing BUG-006: kotlinx-datetime floated to 0.7.x (which removed `kotlinx.datetime.Instant`) while Readium 3.1.0 was compiled against 0.6.x — forcing 0.6.1 resolved it. Note also: Expo applies `withAppBuildGradle` multiple times per prebuild, so any gradle injection must be guarded against duplication.

## Frontend Build Layers

1. Foundation — Expo init, Expo Router, folder structure, RN Paper theme, API config, EAS custom dev build ✅
2. Library screen — Zustand store, API service, book list UI ✅
3. Upload flow — file picker, file system copy, POST to backend ✅
4. EPUB reader — react-native-readium, chapter nav, progress reporting, font-size control ✅ (native build was blocked on BUG-006 — see Config Plugins)
5. PDF reader — react-native-pdf, footer page-turn buttons, fit-to-width, progress reporting ✅
6. Chat overlay — @gorhom/bottom-sheet, SSE streaming consumer, markdown rendering, history loading, keyboard tracking ✅
7. Polish + integration — transitions, loading states, Settings screen, OTA updates, end-to-end testing (in progress)

## Frontend Key Design Rules

- **components/** are pure UI — props in, render out. No API calls inside components.
- **services/** is where all network and file system calls live. Never call `fetch` directly from a component.
- **hooks/** contains stateful behaviours that span components (reading, chat).
- **Zustand store** is the single source of truth for shared state — library list, active book, reading theme.
- **API base URL** always comes from `constants/api.ts` — never hardcoded elsewhere.
- **Upload size limit** is mirrored in `constants/api.ts` (`MAX_UPLOAD_SIZE_MB`) and must match the backend env var of the same name. Backend's HTTP 413 path is the safety net for any drift.
- **Progress reporting** fires at every 5% scroll threshold — `scroll_pct` is a 0–100 integer. `unit_id` for EPUB is the reader locator `href` sent through verbatim (`useReader.ts` sets `unit_id = locator.href`; never derived or shortened), matching `parse_epub`'s output — a container-root-relative path such as `OEBPS/heart-lamp-1.xhtml` or `text/part0000.html`, where the OPF directory varies per book. `unit_id` for PDF is `page_N` (literal `page_${page}`, react-native-pdf's 1-based page).
- **Chat streaming** consumes `text/event-stream` — render tokens as they arrive, handle `[DONE]` / `[ERROR:<reason>]` to re-enable input.
- **All book_id values** are UUID strings from the backend.
