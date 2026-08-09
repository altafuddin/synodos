import { StyleSheet } from 'react-native';
import { Card, Text, Chip, useTheme } from 'react-native-paper';
import type { Book } from '../types';

interface LibraryCardProps {
  book: Book;
  onPress: () => void;
}

export default function LibraryCard({ book, onPress }: LibraryCardProps) {
  const theme = useTheme();

  const isEpub = book.format === 'epub';
  const badgeColor = isEpub ? '#1a73e8' : '#e6930a';
  // Only an explicit false means "checked and missing" — undefined (not yet
  // reconciled) renders as normal.
  const fileMissing = book.hasLocalFile === false;

  return (
    <Card
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface },
        fileMissing && styles.cardMissing,
      ]}
      onPress={onPress}
    >
      <Card.Content style={styles.content}>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }} numberOfLines={2}>
          {book.title}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          numberOfLines={1}
        >
          {book.author ?? 'Unknown author'}
        </Text>
        <Chip
          compact
          style={[styles.badge, { backgroundColor: badgeColor }]}
          textStyle={styles.badgeText}
        >
          {book.format.toUpperCase()}
        </Chip>
        {fileMissing && (
          <Text
            variant="bodySmall"
            style={[styles.missingLabel, { color: theme.colors.error }]}
          >
            File missing — unreadable on this device
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
  },
  cardMissing: {
    opacity: 0.6,
  },
  missingLabel: {
    marginTop: 8,
  },
  content: {
    paddingVertical: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
