import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  IconButton,
  Menu,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import type { ReadiumViewRef } from 'react-native-readium';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { getBook } from '../../services/books';
import { getBookFileUri } from '../../services/fileStorage';
import { useBookStore } from '../../stores/bookStore';
import ReaderEpub from '../../components/ReaderEpub';
import ReaderPdf, { type ReaderPdfRef } from '../../components/ReaderPdf';
import ChatSheet from '../../components/ChatSheet';
import type { BookDetail, Locator } from '../../types';
import type { ThemeName } from '../../constants/themes';
import { createLogger } from '../../utils/logger';

const log = createLogger('reader');

const THEME_CYCLE: Record<ThemeName, ThemeName> = {
  dark: 'sepia',
  sepia: 'light',
  light: 'dark',
};

const FONT_SIZE_STEP = 0.1;
const FONT_SIZE_MIN = 0.8;
const FONT_SIZE_MAX = 2.0;
const FONT_SIZE_DEFAULT = 1.0;

export default function ReaderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const storeTheme = useBookStore((s) => s.theme);
  const setTheme = useBookStore((s) => s.setTheme);
  const fontSize = useBookStore((s) => s.fontSize);
  const setFontSize = useBookStore((s) => s.setFontSize);
  const setActiveBook = useBookStore((s) => s.setActiveBook);

  const [bookDetail, setBookDetail] = useState<BookDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fontMenuVisible, setFontMenuVisible] = useState(false);

  const readerRef = useRef<ReadiumViewRef>(null);
  const pdfReaderRef = useRef<ReaderPdfRef>(null);
  const chatRef = useRef<BottomSheetModal>(null);

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

  // PDF-only resume page, parsed from the `page_N` resume cursor. Page-granular
  // (within-page progression is not restorable). Defaults to page 1.
  const initialPage = useMemo<number>(() => {
    if (bookDetail?.format !== 'pdf') return 1;
    const match = /^page_(\d+)$/.exec(bookDetail.current_position ?? '');
    return match ? parseInt(match[1], 10) : 1;
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

  const decreaseFontSize = () => {
    setFontSize(Math.max(FONT_SIZE_MIN, +(fontSize - FONT_SIZE_STEP).toFixed(2)));
  };
  const increaseFontSize = () => {
    setFontSize(Math.min(FONT_SIZE_MAX, +(fontSize + FONT_SIZE_STEP).toFixed(2)));
  };
  const resetFontSize = () => {
    setFontSize(FONT_SIZE_DEFAULT);
    setFontMenuVisible(false);
  };

  // Footer chevrons drive whichever renderer is mounted — the Readium ref for
  // EPUB, the setPage-adapter ref for PDF (react-native-pdf has no
  // directional API of its own).
  const goForward = () => {
    if (format === 'pdf') pdfReaderRef.current?.goForward();
    else readerRef.current?.goForward();
  };
  const goBackward = () => {
    if (format === 'pdf') pdfReaderRef.current?.goBackward();
    else readerRef.current?.goBackward();
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
          {bookDetail?.format === 'epub' && (
            <Menu
              visible={fontMenuVisible}
              onDismiss={() => setFontMenuVisible(false)}
              anchor={
                <IconButton
                  icon="format-size"
                  onPress={() => setFontMenuVisible(true)}
                  iconColor={theme.colors.onSurface}
                />
              }
            >
              <View style={styles.fontSizeRow}>
                <IconButton
                  icon="minus"
                  onPress={decreaseFontSize}
                  disabled={fontSize <= FONT_SIZE_MIN}
                />
                <Text style={styles.fontSizeLabel}>
                  {Math.round(fontSize * 100)}%
                </Text>
                <IconButton
                  icon="plus"
                  onPress={increaseFontSize}
                  disabled={fontSize >= FONT_SIZE_MAX}
                />
              </View>
              <Menu.Item onPress={resetFontSize} title="Reset" leadingIcon="restore" />
            </Menu>
          )}
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
          <ReaderPdf
            ref={pdfReaderRef}
            bookId={bookId}
            fileUrl={pdfFileUrl}
            initialPage={initialPage}
          />
        )}
      </View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.surface }}>
        <View style={styles.footerRow}>
          <IconButton
            icon="chevron-left"
            size={32}
            onPress={goBackward}
            iconColor={theme.colors.onSurface}
          />
          <IconButton
            icon="message-text-outline"
            size={28}
            onPress={() => chatRef.current?.present()}
            iconColor={theme.colors.primary}
          />
          <IconButton
            icon="chevron-right"
            size={32}
            onPress={goForward}
            iconColor={theme.colors.onSurface}
          />
        </View>
      </SafeAreaView>

      <ChatSheet ref={chatRef} bookId={bookId} />
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
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  fontSizeLabel: { minWidth: 48, textAlign: 'center' },
});