import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import type { ReadiumViewRef } from 'react-native-readium';
import { getBook } from '../../services/books';
import { getBookFileUri } from '../../services/fileStorage';
import { useBookStore } from '../../stores/bookStore';
import ReaderEpub from '../../components/ReaderEpub';
import type { BookDetail, Locator } from '../../types';
import type { ThemeName } from '../../constants/themes';

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
    if (!bookDetail) return undefined;
    const entries = Object.entries(bookDetail.read_positions);
    if (entries.length === 0) return undefined;

    let bestUnit = entries[0][0];
    let bestPct = entries[0][1];
    for (const [unitId, pct] of entries) {
      if (pct > bestPct) {
        bestPct = pct;
        bestUnit = unitId;
      }
    }
    if (bestPct === 0) return undefined;

    return {
      href: bestUnit,
      type: 'text/html',
      locations: { progression: bestPct / 100 },
    };
  }, [bookDetail]);

  const localFileUrl = useMemo(() => getBookFileUri(bookId, 'epub'), [bookId]);

  useEffect(() => {
    const f = new File(localFileUrl);
    console.log('[Synodos] EPUB file exists on disk:', f.exists, 'uri:', localFileUrl);
  }, [localFileUrl]);

  const cycleTheme = () => {
    setTheme(THEME_CYCLE[storeTheme]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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

        {bookDetail !== null && (
          <ReaderEpub
            ref={readerRef}
            bookId={bookId}
            fileUrl={localFileUrl}
            initialLocator={initialLocator}
          />
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