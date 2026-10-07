import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
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

// Auto-hiding chrome (header + footer bars): shown by a centre tap, hidden by
// a second centre tap or after this long without touching a bar.
const CHROME_AUTO_HIDE_MS = 4000;
const CHROME_ANIM_MS = 200;

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
  const patchBookInStore = useBookStore((s) => s.patchBookInStore);
  // Kept apart from bookDetail on purpose: initialLocator/initialPage are
  // memoized on bookDetail, so writing chat_mode into it would hand the reader
  // a fresh initialLocation and could snap it back to the opening position.
  const [chatMode, setChatMode] = useState<'open' | 'strict'>('open');

  const [chromeVisible, setChromeVisible] = useState(false);
  const chromeAnim = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Measured bar heights drive the slide distance; fallbacks cover the first
  // frame before onLayout (bars start hidden, so a wrong guess is invisible).
  const [headerHeight, setHeaderHeight] = useState(100);
  const [footerHeight, setFooterHeight] = useState(100);

  const readerRef = useRef<ReadiumViewRef>(null);
  const pdfReaderRef = useRef<ReaderPdfRef>(null);
  const chatRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    let cancelled = false;
    setActiveBook(bookId);

    (async () => {
      try {
        const detail = await getBook(bookId);
        if (!cancelled) {
          setBookDetail(detail);
          setChatMode(detail.chat_mode);
        }
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

  // Optimistic: the chip flips immediately; patchBookInStore reverts the
  // library entry on failure and rethrows so the chip reverts too.
  const toggleChatMode = useCallback(() => {
    const prevMode = chatMode;
    const newMode = prevMode === 'open' ? 'strict' : 'open';
    setChatMode(newMode);
    patchBookInStore(bookId, { chat_mode: newMode }).catch(() => {
      setChatMode(prevMode);
    });
  }, [chatMode, bookId, patchBookInStore]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setChromeVisible(false);
    }, CHROME_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  // Arm the auto-hide whenever chrome is up — except while the font-size Menu
  // is open (it renders in a portal outside the bars, so touches there can't
  // reset the timer). Closing the Menu re-arms a full 4s.
  useEffect(() => {
    if (chromeVisible && !fontMenuVisible) scheduleHide();
    else clearHideTimer();
    return clearHideTimer;
  }, [chromeVisible, fontMenuVisible, scheduleHide, clearHideTimer]);

  useEffect(() => {
    Animated.timing(chromeAnim, {
      toValue: chromeVisible ? 1 : 0,
      duration: CHROME_ANIM_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, chromeAnim]);

  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  // Any touch on a bar (back, title, font menu, theme, chevrons, chat) restarts
  // the 4s countdown. onTouchStart sees touches even when a child button
  // becomes the responder. If the touch opens the font Menu, the effect above
  // cancels this timer straight after.
  const onChromeTouch = useCallback(() => {
    if (chromeVisible && !fontMenuVisible) scheduleHide();
  }, [chromeVisible, fontMenuVisible, scheduleHide]);

  const headerAnimStyle = {
    opacity: chromeAnim,
    transform: [
      {
        translateY: chromeAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-headerHeight, 0],
        }),
      },
    ],
  };
  const footerAnimStyle = {
    opacity: chromeAnim,
    transform: [
      {
        translateY: chromeAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [footerHeight, 0],
        }),
      },
    ],
  };

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

      {/* Body fills the whole screen; the bars overlay it rather than sharing
          the layout, so toggling chrome never resizes (and re-paginates) the
          reader. */}
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
            onCenterTap={toggleChrome}
          />
        )}

        {bookDetail !== null && bookDetail.format === 'pdf' && (
          <ReaderPdf
            ref={pdfReaderRef}
            bookId={bookId}
            fileUrl={pdfFileUrl}
            initialPage={initialPage}
            onCenterTap={toggleChrome}
          />
        )}
      </View>

      <Animated.View
        style={[styles.headerBar, headerAnimStyle]}
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        onTouchStart={onChromeTouch}
      >
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
      </Animated.View>

      <Animated.View
        style={[styles.footerBar, footerAnimStyle]}
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        onTouchStart={onChromeTouch}
      >
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
      </Animated.View>

      <ChatSheet
        ref={chatRef}
        bookId={bookId}
        chatMode={chatMode}
        onToggleChatMode={toggleChatMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  body: { flex: 1 },
  headerBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
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