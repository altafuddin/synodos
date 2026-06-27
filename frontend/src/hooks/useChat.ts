import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatHistory, streamAnswer } from '../services/chat';
import type { ChatMessage } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('useChat');

// Client-side ids for optimistic messages (history rows may arrive without one).
// Stable per message so the list keys by id and only the streaming bubble re-renders.
let idCounter = 0;
const nextId = () => `local-${Date.now()}-${idCounter++}`;

export interface UseChat {
  messages: ChatMessage[];
  input: string;
  isStreaming: boolean;
  setInput: (value: string) => void;
  send: () => void;
}

export function useChat(bookId: string): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Close handle for the in-flight stream (set while streaming, cleared on settle).
  const cleanupRef = useRef<(() => void) | null>(null);
  const tokenCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const history = await getChatHistory(bookId);
        if (cancelled) return;
        setMessages(history.map((m) => ({ ...m, id: m.id ?? nextId() })));
        log.info('history_loaded', { count: history.length });
      } catch (err) {
        if (cancelled) return;
        log.error('history_load_failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    })();

    return () => {
      cancelled = true;
      // Abort any open stream when the book changes or the screen unmounts.
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [bookId]);

  const send = useCallback(() => {
    const question = input.trim();
    if (!question || isStreaming) return;

    const assistantId = nextId();
    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: question,
      created_at: now,
    };
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      created_at: now,
    };

    // Optimistic: user turn + empty assistant turn the tokens stream into.
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    tokenCountRef.current = 0;
    log.info('stream_open', { question_chars: question.length });

    // .map keeps every non-matching message's object identity, so a memoized
    // row component only re-renders the assistant bubble on each token.
    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    cleanupRef.current = streamAnswer(bookId, question, {
      onToken: (text) => {
        tokenCountRef.current += 1;
        patchAssistant((m) => ({ ...m, content: m.content + text }));
      },
      onDone: () => {
        log.info('stream_done', { token_count: tokenCountRef.current });
        cleanupRef.current = null;
        setIsStreaming(false);
      },
      onError: (message) => {
        log.error('stream_error', { message });
        cleanupRef.current = null;
        patchAssistant((m) => ({
          ...m,
          content: m.content ? `${m.content}\n\n⚠️ ${message}` : `⚠️ ${message}`,
        }));
        setIsStreaming(false);
      },
    });
  }, [bookId, input, isStreaming]);

  return { messages, input, isStreaming, setInput, send };
}