import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Pdf from 'react-native-pdf';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderPdf');

type ReaderPdfProps = {
  bookId: string;
  fileUrl: string;
};

export default function ReaderPdf({ bookId, fileUrl }: ReaderPdfProps) {
  const theme = useTheme();
  // Current page (1-based, from react-native-pdf). Not reported yet — 5c.
  const [, setCurrentPage] = useState(1);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Pdf
        source={{ uri: fileUrl }}
        style={[styles.pdf, { backgroundColor: theme.colors.background }]}
        onLoadComplete={(numberOfPages) => {
          log.info('pdf_loaded', { numberOfPages });
        }}
        onPageChanged={(page, numberOfPages) => {
          setCurrentPage(page);
          log.debug('pdf_page_changed', { page, numberOfPages });
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