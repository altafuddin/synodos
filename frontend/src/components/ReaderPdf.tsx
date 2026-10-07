import { forwardRef, useImperativeHandle, useRef } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Pdf, { type PdfRef } from 'react-native-pdf';
import { useReader } from '../hooks/useReader';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderPdf');

// react-native-pdf has no goForward/goBackward — only setPage(n). This ref
// adapts the reader screen's direction-based footer buttons onto it.
export type ReaderPdfRef = {
  goForward: () => void;
  goBackward: () => void;
};

type ReaderPdfProps = {
  bookId: string;
  fileUrl: string;
  initialPage?: number;
  // Fired on a single tap in the horizontal centre third of the page.
  onCenterTap?: () => void;
};

const ReaderPdf = forwardRef<ReaderPdfRef, ReaderPdfProps>(
  ({ bookId, fileUrl, initialPage, onCenterTap }, ref) => {
    const theme = useTheme();
    const { handlePageChanged } = useReader(bookId);
    const pdfRef = useRef<PdfRef>(null);
    // Refs, not state: page turns need current values inside imperative
    // handlers and nothing in this component renders them.
    const currentPageRef = useRef(initialPage ?? 1);
    const pageCountRef = useRef(0);
    const widthRef = useRef(0);

    const turnPage = (delta: 1 | -1) => {
      const pageCount = pageCountRef.current;
      if (pageCount <= 0) return; // not loaded yet
      const target = Math.max(
        1,
        Math.min(pageCount, currentPageRef.current + delta)
      );
      log.debug('page_turn', {
        delta,
        from: currentPageRef.current,
        to: target,
        pageCount,
      });
      if (target === currentPageRef.current) return; // clamped at an edge
      pdfRef.current?.setPage(target);
    };

    useImperativeHandle(ref, () => ({
      goForward: () => turnPage(1),
      goBackward: () => turnPage(-1),
    }));

    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
      >
        <Pdf
          ref={pdfRef}
          source={{ uri: fileUrl }}
          page={initialPage}
          fitPolicy={0}
          style={[styles.pdf, { backgroundColor: theme.colors.background }]}
          onLoadComplete={(numberOfPages) => {
            pageCountRef.current = numberOfPages;
            log.info('pdf_loaded', { numberOfPages });
          }}
          onPageChanged={(page, numberOfPages) => {
            currentPageRef.current = page;
            pageCountRef.current = numberOfPages;
            log.debug('pdf_page_changed', { page, numberOfPages });
            handlePageChanged(page);
          }}
          // Native single-tap callback — fires only for a confirmed single tap
          // (not double-tap zoom, scroll or pinch), so no overlay is needed and
          // nothing is intercepted. Android reports x in physical pixels
          // (MotionEvent.getX()); iOS in points.
          onPageSingleTap={(_page, x) => {
            const width = widthRef.current;
            if (width <= 0) return;
            const xDp = Platform.OS === 'android' ? x / PixelRatio.get() : x;
            if (xDp > width / 3 && xDp < (width * 2) / 3) onCenterTap?.();
          }}
          onError={(error) => {
            log.warn('pdf_error', { error: String(error) });
          }}
        />
      </View>
    );
  }
);

ReaderPdf.displayName = 'ReaderPdf';

export default ReaderPdf;

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
});
