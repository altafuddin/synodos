import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
};

const ReaderPdf = forwardRef<ReaderPdfRef, ReaderPdfProps>(
  ({ bookId, fileUrl, initialPage }, ref) => {
    const theme = useTheme();
    const { handlePageChanged } = useReader(bookId);
    const pdfRef = useRef<PdfRef>(null);
    // Refs, not state: page turns need current values inside imperative
    // handlers and nothing in this component renders them.
    const currentPageRef = useRef(initialPage ?? 1);
    const pageCountRef = useRef(0);

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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
