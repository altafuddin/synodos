import { useEffect, useState } from 'react';
import { Alert, View, FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, FAB, Banner, Snackbar, useTheme } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useBookStore } from '../stores/bookStore';
import LibraryCard from '../components/LibraryCard';
import UploadModal from '../components/UploadModal';
import type { Book } from '../types';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { books, isLoading, hasLoaded, error, fetchBooks, clearError, removeBook } =
    useBookStore();
  const [uploadVisible, setUploadVisible] = useState(false);
  // book_id of the delete currently in flight — blocks re-tap/re-long-press on
  // that one card until the store splices it out (success) or we clear it (failure).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const confirmDelete = (book: Book) => {
    if (deletingId) return;
    Alert.alert(
      `Delete "${book.title}"?`,
      'This removes the book and its chat history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'default' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(book.book_id);
            try {
              await removeBook(book.book_id);
              // Success: store splices the book out, the card unmounts on its
              // own. deletingId is dropped with it — no need to reset here.
            } catch {
              setDeletingId(null);
              setDeleteError(`Couldn't delete "${book.title}". Please try again.`);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Book }) => (
    <LibraryCard
      book={item}
      onPress={() => openBook(item)}
      onLongPress={() => confirmDelete(item)}
      disabled={deletingId === item.book_id}
    />
  );

  // Empty is a distinct state from error: it may only render after a fetch has
  // actually succeeded and returned zero books. On error `books` is still the
  // initial [] (a failed fetch doesn't clear it), so we must not treat that as
  // "empty" — the Banner is the sole error UI in that case.
  const showEmpty = !isLoading && !error && hasLoaded && books.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'Library' }} />

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
      ) : showEmpty ? (
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

      <Snackbar
        visible={!!deleteError}
        onDismiss={() => setDeleteError(null)}
        duration={4000}
        action={{ label: 'Dismiss', onPress: () => setDeleteError(null) }}
      >
        {deleteError ?? ''}
      </Snackbar>
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
