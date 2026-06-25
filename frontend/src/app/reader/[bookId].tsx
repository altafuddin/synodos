import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import type { ReadiumViewRef } from 'react-native-readium';
import { getBook } from '../../services/books';
import { getBookFileUri } from '../../services/fileStorage';
import { useBookStore } from '../../stores/bookStore';
import ReaderEpub from '../../components/ReaderEpub';
import ReaderPdf from '../../components/ReaderPdf';
import type { BookDetail, Locator } from '../../types';
import type { ThemeName } from '../../constants/themes';
import { createLogger } from '../../utils/logger';

const log = createLogger('reader');

const THEME_CYCLE: Record<ThemeName, ThemeName> = {
  dark: 'sepia',
  sepia: 'light',
  light: 'dark',
};

export default function ReaderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const storeTheme = useBookStore((s) => s.theme);
  const setTheme = useBookStore((s) => s.setTheme);
  const setActiveBook = useBookStore((s) => s.setActiveBook);

  const [bookDetail, setBookDetail] = useState<BookDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const readerRef = useRef<ReadiumViewRef>(null);

  useEffect(() => {
    let cancelled = false;
    setActiveBook(bookId);

    (async () => {
      try {
        const detail = await getBook(bookId);
        if (!cancelled) setBookDetail(detail);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load book';
          setLoadError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
      setActiveBook(null);
    };
  }, [bookId, setActiveBook]);

  const initialLocator = useMemo<Locator | undefined>(() => {
    if (bookDetail?.format !== 'epub') return undefined; // EPUB-only locator
    const href = bookDetail?.current_position;
    if (!href) return undefined; // fresh book → no resume

    const pct = bookDetail?.current_progression ?? 0;
    return {
      href,
      type: 'text/html',
      locations: { progression: pct / 100 },
    };
  }, [bookDetail]);

  const format = bookDetail?.format ?? null;

  // EPUB-only file URI — scoped to the epub branch, never built for PDF.
  const epubFileUrl = useMemo(() => getBookFileUri(bookId, 'epub'), [bookId]);
  // PDF-only file URI — scoped to the pdf branch.
  const pdfFileUrl = useMemo(() => getBookFileUri(bookId, 'pdf'), [bookId]);

  useEffect(() => {
    if (format === null) return;
    log.info('reader_format_branch', { format });
  }, [format]);

  useEffect(() => {
    if (format !== 'epub') return;
    const f = new File(epubFileUrl);
    log.debug('epub_file_check', { exists: f.exists, uri: epubFileUrl });
  }, [format, epubFileUrl]);

  const cycleTheme = () => {
    setTheme(THEME_CYCLE[storeTheme]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.surface }}>
        <View style={styles.headerRow}>
          <IconButton
            icon="arrow-left"
            onPress={() => router.back()}
            iconColor={theme.colors.onSurface}
          />
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={[styles.headerTitle, { color: theme.colors.onSurface }]}
          >
            {bookDetail?.title ?? ''}
          </Text>
          <IconButton
            icon="theme-light-dark"
            onPress={cycleTheme}
            iconColor={theme.colors.onSurface}
          />
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        {bookDetail === null && loadError === null && (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={styles.centered}
          />
        )}

        {loadError !== null && (
          <View style={styles.centered}>
            <Text style={{ color: theme.colors.onBackground }}>{loadError}</Text>
            <IconButton
              icon="arrow-left"
              onPress={() => router.back()}
              iconColor={theme.colors.onSurface}
            />
          </View>
        )}

        {bookDetail !== null && bookDetail.format === 'epub' && (
          <ReaderEpub
            ref={readerRef}
            bookId={bookId}
            fileUrl={epubFileUrl}
            initialLocator={initialLocator}
          />
        )}

        {bookDetail !== null && bookDetail.format === 'pdf' && (
          <ReaderPdf bookId={bookId} fileUrl={pdfFileUrl} />
        )}
      </View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.surface }}>
        <View style={styles.footerRow}>
          <IconButton
            icon="chevron-left"
            size={32}
            onPress={() => readerRef.current?.goBackward()}
            iconColor={theme.colors.onSurface}
          />
          <IconButton
            icon="chevron-right"
            size={32}
            onPress={() => readerRef.current?.goForward()}
            iconColor={theme.colors.onSurface}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  body: { flex: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});