import { useCallback, useRef } from 'react';
import type { PublicationReadyEvent } from 'react-native-readium';
import type { Locator } from '../types';
import { reportProgress } from '../services/progress';
import { createLogger } from '../utils/logger';

const log = createLogger('useReader');

export function useReader(bookId: string): {
  handleLocationChange: (locator: Locator) => void;
  handlePublicationReady: (event: PublicationReadyEvent) => void;
  handlePageChanged: (page: number) => void;
} {
  const lastReportedRef = useRef<Record<string, number>>({});
  const lastReportedPageRef = useRef<number>(-1);

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
      reportProgress(bookId, unit_id, scroll_pct).catch((err) =>
        log.warn('progress_report_failed', { error: String(err) })
      );
    },
    [bookId]
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
      reportProgress(bookId, unit_id, scroll_pct).catch((err) =>
        // A 404 here is the benign sparse-manifest case (image/empty pages are
        // skipped in the manifest). Logged at debug, not warn. Tradeoff: real
        // network errors on this path also go to debug for now.
        log.debug('progress_report_skipped', { unit_id, error: String(err) })
      );
    },
    [bookId]
  );

  return { handleLocationChange, handlePublicationReady, handlePageChanged };
}
