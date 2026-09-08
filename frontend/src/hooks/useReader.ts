import { useCallback, useEffect, useRef } from 'react';
import type { PublicationReadyEvent } from 'react-native-readium';
import type { Locator } from '../types';
import { reportProgress } from '../services/progress';
import { enqueue, flushQueue, isRetryableError } from '../services/progressQueue';
import { createLogger } from '../utils/logger';

const log = createLogger('useReader');

export function useReader(bookId: string): {
  handleLocationChange: (locator: Locator) => void;
  handlePublicationReady: (event: PublicationReadyEvent) => void;
  handlePageChanged: (page: number) => void;
} {
  const lastReportedRef = useRef<Record<string, number>>({});
  const lastReportedPageRef = useRef<number>(-1);

  // Flush any reports stranded by an earlier transient failure — once when the
  // reader opens, once when it closes. The queue is module-level and spans
  // books, so this has no deps: it fires on mount and unmount only.
  useEffect(() => {
    void flushQueue();
    return () => {
      void flushQueue();
    };
  }, []);

  // Flush the retry queue oldest-first, THEN send this report — so the newest
  // write always lands last (progress.py moves the resume cursor even on a
  // non-advancing report, so a stale replay must never follow a fresh one).
  // A transient failure of this report is re-queued; a 400/404 is not (it would
  // fail forever). onFailure keeps the caller's existing log line: EPUB is
  // warn, PDF is debug.
  const flushThenReport = useCallback(
    (unitId: string, scrollPct: number, onFailure: (err: unknown) => void) => {
      void (async () => {
        await flushQueue();
        try {
          await reportProgress(bookId, unitId, scrollPct);
        } catch (err) {
          if (isRetryableError(err)) {
            enqueue({ bookId, unitId, scrollPct });
          }
          onFailure(err);
        }
      })();
    },
    [bookId]
  );

  const handleLocationChange = useCallback(
    (locator: Locator) => {
      if (locator.locations?.progression === undefined) return;

      const unit_id = locator.href;
      const scroll_pct = Math.max(
        0,
        Math.min(100, Math.round(locator.locations.progression * 100))
      );

      const lastReported = lastReportedRef.current[unit_id] ?? -1;
      if (Math.abs(scroll_pct - lastReported) < 5) return;

      lastReportedRef.current[unit_id] = scroll_pct;

      log.debug('progress_reported', { unit_id, scroll_pct });
      flushThenReport(unit_id, scroll_pct, (err) =>
        log.warn('progress_report_failed', { error: String(err) })
      );
    },
    [flushThenReport]
  );

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      log.info('publication_ready', {
        title: event.metadata.title,
        positions: event.positions.length,
      });
      log.debug('toc_loaded', { entries: event.tableOfContents?.length ?? 0 });
    },
    []
  );

  // PDF page-flip progress. Page-granular: always 100% of the page's text, no
  // 5% threshold (that's EPUB-only). unit_id is the literal `page_${page}` with
  // react-native-pdf's already-1-based page — sent directly, no +1/-1.
  const handlePageChanged = useCallback(
    (page: number) => {
      if (page === lastReportedPageRef.current) return; // dedupe repeat fires
      lastReportedPageRef.current = page;

      const unit_id = `page_${page}`;
      const scroll_pct = 100;

      log.debug('progress_reported', { unit_id, scroll_pct });
      flushThenReport(unit_id, scroll_pct, (err) =>
        // A 404 here is the benign sparse-manifest case (image/empty pages are
        // skipped in the manifest). Logged at debug, not warn. Tradeoff: real
        // network errors on this path also go to debug for now.
        log.debug('progress_report_skipped', { unit_id, error: String(err) })
      );
    },
    [flushThenReport]
  );

  return { handleLocationChange, handlePublicationReady, handlePageChanged };
}
