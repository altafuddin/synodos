import { useCallback, useRef } from 'react';
import type { PublicationReadyEvent } from 'react-native-readium';
import type { Locator } from '../types';
import { reportProgress } from '../services/progress';
import { createLogger } from '../utils/logger';

const log = createLogger('useReader');

export function useReader(bookId: string): {
  handleLocationChange: (locator: Locator) => void;
  handlePublicationReady: (event: PublicationReadyEvent) => void;
} {
  const lastReportedRef = useRef<Record<string, number>>({});

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

  return { handleLocationChange, handlePublicationReady };
}
