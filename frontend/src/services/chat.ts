import EventSource from 'react-native-sse';
import { apiFetch } from './api';
import API_BASE_URL from '../constants/api';
import type { ChatMessage } from '../types';

// GET /api/books/{bookId}/chat envelope — server returns { book_id, messages }.
interface ChatHistoryResponse {
  book_id: string;
  messages: ChatMessage[];
}

export async function getChatHistory(bookId: string): Promise<ChatMessage[]> {
  const res = await apiFetch<ChatHistoryResponse>(`/api/books/${bookId}/chat`);
  return res.messages;
}

export interface StreamHandlers {
  onToken: (text: string) => void;
  onDone: () => void;
  // Receives the raw reason token (rate_limit, api_error, unknown,
  // connection_lost) — not a display message. Mapping to user-facing copy
  // happens in the consumer.
  onError: (reason: string) => void;
}

/**
 * Stream an answer over SSE. Uses react-native-sse (pure-JS, XHR-backed) rather
 * than apiFetch — apiFetch resolves via .json() and cannot read text/event-stream.
 *
 * The backend frames each token as `data: {"token": "<text>"}\n\n` — JSON-encoded
 * so leading/trailing whitespace and embedded newlines survive SSE line-trimming.
 * react-native-sse parses the SSE wire format itself, so `event.data` is already
 * the post-`data: ` payload; we JSON.parse it and read `.token`. Sentinels stay
 * plain strings and are checked BEFORE the parse: "[DONE]" → onDone,
 * "[ERROR:<reason>]" → onError (bare "[ERROR]" accepted as a fallback). They are
 * never valid JSON, so there is no ambiguity with a token payload.
 *
 * Returns a cleanup function that closes the stream (for unmount/abort).
 */
export function streamAnswer(
  bookId: string,
  question: string,
  handlers: StreamHandlers
): () => void {
  const url = `${API_BASE_URL}/api/books/${bookId}/chat`;

  const es = new EventSource(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    // One-shot stream — disable react-native-sse's auto-reconnect.
    pollingInterval: 0,
  });

  let settled = false;
  const cleanup = () => {
    es.removeAllEventListeners();
    es.close();
  };

  es.addEventListener('message', (event) => {
    const data = event.data;
    if (data == null) return;

    if (data === '[DONE]') {
      if (settled) return;
      settled = true;
      cleanup();
      handlers.onDone();
      return;
    }

    const errorMatch = /^\[ERROR(?::(.*))?\]$/.exec(data);
    if (errorMatch) {
      if (settled) return;
      settled = true;
      cleanup();
      handlers.onError(errorMatch[1] || 'unknown');
      return;
    }

    // Token frames are JSON: { "token": "<text>" }. Parse and extract .token.
    // Sentinels were already handled above, so anything here should be JSON;
    // fall back to the raw payload if a malformed frame slips through.
    let token: string;
    try {
      const parsed = JSON.parse(data);
      token = typeof parsed?.token === 'string' ? parsed.token : data;
    } catch {
      token = data;
    }
    handlers.onToken(token);
  });

  es.addEventListener('error', () => {
    if (settled) return;
    settled = true;
    cleanup();
    handlers.onError('connection_lost');
  });

  return cleanup;
}