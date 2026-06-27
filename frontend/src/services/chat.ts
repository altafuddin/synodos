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
  onError: (message: string) => void;
}

/**
 * Stream an answer over SSE. Uses react-native-sse (pure-JS, XHR-backed) rather
 * than apiFetch — apiFetch resolves via .json() and cannot read text/event-stream.
 *
 * The backend frames each chunk as `data: {raw text}\n\n`. react-native-sse parses
 * the SSE wire format itself, so `event.data` is already the post-`data: ` payload
 * (multi-line chunks rejoined with \n). Tokens are raw text, never JSON — passed
 * through verbatim. Sentinels: "[DONE]" → onDone, "[ERROR]" → onError.
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

    if (data === '[ERROR]') {
      if (settled) return;
      settled = true;
      cleanup();
      handlers.onError('The assistant failed to respond.');
      return;
    }

    handlers.onToken(data);
  });

  es.addEventListener('error', (event) => {
    if (settled) return;
    settled = true;
    cleanup();
    const message =
      'message' in event && event.message
        ? event.message
        : 'Connection to the assistant was lost.';
    handlers.onError(message);
  });

  return cleanup;
}