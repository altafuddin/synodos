// In-memory retry queue for failed progress reports.
//
// reportProgress is fire-and-forget in the reader: on failure the position is
// lost, because useReader's lastReportedRef / lastReportedPageRef have already
// advanced past it. This queue holds transiently-failed reports so a later
// trigger (next report, reader mount, reader unmount) can replay them.
//
// Design:
//  - Module-level array, in-memory only. No AsyncStorage, no persistence, no
//    Zustand. It dies with the process — that is intended.
//  - Entries span books, so bookId is stored per entry, not module-global.
//  - Replay is safe: the backend keeps a per-unit high-water mark in
//    read_positions.json and returns False for any scroll_pct <= last_pct, so
//    resending a duplicate appends nothing. No idempotency key needed.
//  - Ordering hazard: progress.py sets book.current_position /
//    current_progression UNCONDITIONALLY, even on a non-advancing report. A
//    stale queued item landing AFTER a newer report drags the resume cursor
//    backward. Mitigation: the queue is always flushed oldest-first, awaited
//    sequentially, BEFORE the current report is sent (see useReader) — so the
//    newest write lands last.
//  - Bounded at MAX_QUEUE; on overflow the OLDEST entry is dropped (a long
//    offline session must not grow this without bound).

import { ApiError } from './api';
import { reportProgress } from './progress';
import { createLogger } from '../utils/logger';

const log = createLogger('progressQueue');

export type QueuedProgress = {
  bookId: string;
  unitId: string;
  scrollPct: number;
};

const MAX_QUEUE = 50;

const queue: QueuedProgress[] = [];

// Worth retrying only on transient failures: network / transport errors (fetch
// rejects without an ApiError) and 5xx. A 400 or 404 fails identically forever
// and must never be enqueued.
export function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500;
  }
  return true;
}

export function enqueue(entry: QueuedProgress): void {
  if (queue.length >= MAX_QUEUE) {
    const dropped = queue.shift();
    log.warn('queue_overflow_drop', {
      max: MAX_QUEUE,
      book_id: dropped?.bookId,
      unit_id: dropped?.unitId,
    });
  }
  queue.push(entry);
  log.debug('queue_enqueue', {
    book_id: entry.bookId,
    unit_id: entry.unitId,
    scroll_pct: entry.scrollPct,
    depth: queue.length,
  });
}

// Replay queued reports oldest-first, sequentially (await each — never
// Promise.all — so the resume cursor ends up at the newest position). On the
// first entry that fails again, leave it (and everything behind it) queued and
// stop: no dropping, no hammering the rest of the queue this attempt. The one
// exception is a now-permanent failure (400/404) on a previously-transient
// entry — drop that one so it can't wedge the queue forever, then still abort.
export async function flushQueue(): Promise<void> {
  if (queue.length === 0) return;

  log.debug('queue_flush_start', { depth: queue.length });

  let sent = 0;
  while (queue.length > 0) {
    const entry = queue[0];
    try {
      await reportProgress(entry.bookId, entry.unitId, entry.scrollPct);
    } catch (err) {
      const permanent = !isRetryableError(err);
      if (permanent) {
        queue.shift();
      }
      log.debug('queue_flush_result', {
        sent,
        remaining: queue.length,
        aborted: true,
        dropped_permanent: permanent,
        error: String(err),
      });
      return;
    }
    queue.shift();
    sent += 1;
  }

  log.debug('queue_flush_result', { sent, remaining: 0, aborted: false });
}
