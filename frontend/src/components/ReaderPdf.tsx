import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderPdf');

type ReaderPdfProps = {
  bookId: string;
  fileUrl: string;
};

export default function ReaderPdf({ bookId, fileUrl }: ReaderPdfProps) {
  const theme = useTheme();

  useEffect(() => {
    log.info('mounted', { bookId, fileUrl });
  }, [bookId, fileUrl]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
        PDF reader — Layer 5b
      </Text>
      <Text
        variant="bodySmall"
        style={[styles.path, { color: theme.colors.onSurfaceVariant }]}
      >
        {fileUrl}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  path: { marginTop: 8, textAlign: 'center' },
});