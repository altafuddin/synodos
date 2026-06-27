import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Pdf from 'react-native-pdf';
import { useReader } from '../hooks/useReader';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderPdf');

type ReaderPdfProps = {
  bookId: string;
  fileUrl: string;
  initialPage?: number;
};

export default function ReaderPdf({ bookId, fileUrl, initialPage }: ReaderPdfProps) {
  const theme = useTheme();
  const { handlePageChanged } = useReader(bookId);
  // Current page (1-based, from react-native-pdf).
  const [, setCurrentPage] = useState(1);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Pdf
        source={{ uri: fileUrl }}
        page={initialPage}
        style={[styles.pdf, { backgroundColor: theme.colors.background }]}
        onLoadComplete={(numberOfPages) => {
          log.info('pdf_loaded', { numberOfPages });
        }}
        onPageChanged={(page, numberOfPages) => {
          setCurrentPage(page);
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
});