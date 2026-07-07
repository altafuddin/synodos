// Tagged console wrapper mirroring the backend's structlog conventions:
// one event name + structured fields, gated by a minimum level.
//
// NO-CONTENT RULE: log sizes/counts and metadata only — never book/question/
// answer text. Local file paths and book title/author are fine.
//
// Console output goes to every level ≥ MIN_LEVEL (unchanged behavior). Lines
// at info and above are ALSO appended to a rotating on-device file:
// Paths.document/logs/app.log (+ app.log.1), ~512 KB each. The sink
// initializes lazily on the first flush — loggers are created at module
// import, before any app init, so early lines queue in memory until then.

import { Directory, File, Paths } from 'expo-file-system';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Read process.env directly — same build-time inlining mechanism as
// src/constants/api.ts (NOT @env / react-native-dotenv).
function resolveMinLevel(): Level {
  const raw = process.env.EXPO_PUBLIC_LOG_LEVEL?.toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return __DEV__ ? 'debug' : 'warn';
}

const MIN_LEVEL = resolveMinLevel();

const CONSOLE_METHOD: Record<Level, (...args: unknown[]) => void> = {
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// ---------------------------------------------------------------------------
// File sink
// ---------------------------------------------------------------------------

// Only info and above reach the file — debug stays console-only.
const FILE_MIN_LEVEL: Level = 'info';
const MAX_LOG_FILE_BYTES = 512 * 1024; // rotate current → .1 past this size
const MAX_PENDING_LINES = 500; // memory cap if the filesystem is unavailable

// Lines queued for the next flush. Populated synchronously by log calls;
// drained on a deferred tick so a burst of logs costs one write.
let pendingLines: string[] = [];
let flushScheduled = false;
let sinkBroken = false; // one-way fuse — never let logging crash the app
let logFile: File | null = null;

function initSink(): File {
  const dir = new Directory(Paths.document, 'logs');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, 'app.log');
  if (!file.exists) {
    file.create();
  }
  return file;
}

function rotateIfNeeded(file: File): File {
  if ((file.size ?? 0) <= MAX_LOG_FILE_BYTES) return file;
  const rotated = new File(new Directory(Paths.document, 'logs'), 'app.log.1');
  if (rotated.exists) {
    rotated.delete();
  }
  file.move(rotated);
  return initSink(); // fresh empty current file
}

function flushToFile(): void {
  flushScheduled = false;
  if (sinkBroken || pendingLines.length === 0) return;
  const batch = pendingLines;
  pendingLines = [];
  try {
    logFile = rotateIfNeeded(logFile ?? initSink());
    logFile.write(batch.join('\n') + '\n', { append: true });
  } catch (err) {
    // Disable the sink rather than risk a crash loop; console still works.
    sinkBroken = true;
    console.warn(`[logger] file sink disabled: ${String(err)}`);
  }
}

function safeStringify(fields: Record<string, unknown>): string {
  try {
    return JSON.stringify(fields);
  } catch {
    return '{"error":"unserializable fields"}';
  }
}

function enqueueFileLine(line: string): void {
  if (sinkBroken) return;
  pendingLines.push(line);
  if (pendingLines.length > MAX_PENDING_LINES) {
    pendingLines.shift(); // drop oldest — bounded memory before/without init
  }
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flushToFile, 0);
  }
}

type LogFn = (event: string, fields?: Record<string, unknown>) => void;

export type Logger = {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
};

export function createLogger(tag: string): Logger {
  const make = (level: Level): LogFn => {
    return (event, fields) => {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return; // below threshold → no-op
      const prefix = `${timestamp()} [${level.toUpperCase()}] [${tag}] ${event}`;
      if (fields !== undefined) {
        CONSOLE_METHOD[level](prefix, fields);
      } else {
        CONSOLE_METHOD[level](prefix);
      }
      if (LEVEL_ORDER[level] >= LEVEL_ORDER[FILE_MIN_LEVEL]) {
        // File lines carry the full date (sessions span days); fields are
        // JSON-serialized. Same no-content rule as console.
        const line =
          fields !== undefined
            ? `${new Date().toISOString()} [${level.toUpperCase()}] [${tag}] ${event} ${safeStringify(fields)}`
            : `${new Date().toISOString()} [${level.toUpperCase()}] [${tag}] ${event}`;
        enqueueFileLine(line);
      }
    };
  };

  return {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  };
}
