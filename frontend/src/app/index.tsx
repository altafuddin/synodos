import { useEffect, useState } from 'react';
import { Alert, View, FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, FAB, Banner, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useBookStore } from '../stores/bookStore';
import LibraryCard from '../components/LibraryCard';
import UploadModal from '../components/UploadModal';
import type { Book } from '../types';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { books, isLoading, error, fetchBooks, clearError } = useBookStore();
  const [uploadVisible, setUploadVisible] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const openBook = (book: Book) => {
    // Explicit false = reconciliation confirmed the local copy is gone.
    // Block navigation — a dead file URI renders a blank reader.
    if (book.hasLocalFile === false) {
      Alert.alert(
        'File missing',
        "This book's file is no longer on this device, so it can't be opened. Delete the book and upload it again to keep reading."
      );
      return;
    }
    router.push(`/reader/${book.book_id}`);
  };

  const renderItem = ({ item }: { item: Book }) => (
    <LibraryCard book={item} onPress={() => openBook(item)} />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Banner
        visible={!!error}
        actions={[
          { label: 'Retry', onPress: fetchBooks },
          { label: 'Dismiss', onPress: clearError },
        ]}
        style={{ backgroundColor: theme.colors.errorContainer }}
      >
        {error ?? ''}
      </Banner>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : books.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No books yet
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
          >
            Tap the + button to add your first book
          </Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.book_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      <FAB
        icon="plus"
        label="Add Book"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => setUploadVisible(true)}
      />

      <UploadModal
        visible={uploadVisible}
        onDismiss={() => setUploadVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  list: {
    paddingTop: 8,
    paddingBottom: 88,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    borderRadius: 16,
  },
});
