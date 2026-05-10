import { useCallback, useRef } from 'react';
import type { PublicationReadyEvent } from 'react-native-readium';
import type { Locator } from '../types';
import { reportProgress } from '../services/progress';

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

      reportProgress(bookId, unit_id, scroll_pct).catch((err) =>
        console.warn('Progress report failed:', err)
      );
    },
    [bookId]
  );

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      console.log(
        '[Synodos] Publication ready:',
        event.metadata.title,
        '— positions:',
        event.positions.length
      );
      console.log('[Synodos] TOC entries:', event.tableOfContents?.length ?? 'none');
    },
    []
  );

  return { handleLocationChange, handlePublicationReady };
}
