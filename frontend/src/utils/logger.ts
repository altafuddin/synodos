// Tagged console wrapper mirroring the backend's structlog conventions:
// one event name + structured fields, gated by a minimum level.
//
// NO-CONTENT RULE: log sizes/counts and metadata only — never book/question/
// answer text. Local file paths and book title/author are fine.

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
    };
  };

  return {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  };
}
