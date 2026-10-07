import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  ReadiumView,
  type ReadiumViewRef,
  type Preferences,
} from 'react-native-readium';
import type { Locator } from '../types';
import { useReader } from '../hooks/useReader';
import { useBookStore } from '../stores/bookStore';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderEpub');

// A touch counts as a tap if it lifts within this time and travels less than
// this distance — anything longer or further is a swipe/long-press for Readium.
const TAP_MAX_MS = 300;
const TAP_SLOP = 10;

type ReaderEpubProps = {
  bookId: string;
  fileUrl: string;
  initialLocator?: Locator;
  // Fired on a single tap in the horizontal centre third of the page.
  onCenterTap?: () => void;
};

const ReaderEpub = forwardRef<ReadiumViewRef, ReaderEpubProps>(
  ({ bookId, fileUrl, initialLocator, onCenterTap }, ref) => {
    const innerRef = useRef<ReadiumViewRef>(null);
    const widthRef = useRef(0);
    const onCenterTapRef = useRef(onCenterTap);
    onCenterTapRef.current = onCenterTap;
    const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(
      null
    );
    const theme = useBookStore((s) => s.theme);
    const fontSize = useBookStore((s) => s.fontSize);
    const { handleLocationChange, handlePublicationReady } = useReader(bookId);

    useImperativeHandle(
      ref,
      () => ({
        goTo: (locator) => innerRef.current?.goTo(locator),
        goForward: () => innerRef.current?.goForward(),
        goBackward: () => innerRef.current?.goBackward(),
      }),
      []
    );

    // ReadiumView exposes no tap callback, and an RN Pressable overlay would
    // swallow touches before the native view sees them (breaking swipes that
    // start mid-page). This Manual gesture only OBSERVES touches and never
    // activates, so gesture-handler never intercepts — Readium still receives
    // every swipe, tap, link press and long-press. fail() resets it per touch.
    const centerTapGesture = useMemo(
      () =>
        Gesture.Manual()
          .runOnJS(true)
          .onTouchesDown((e) => {
            const touch = e.allTouches[0];
            tapStartRef.current =
              e.numberOfTouches === 1 && touch
                ? { x: touch.x, y: touch.y, time: Date.now() }
                : null; // multi-touch is never a tap
          })
          .onTouchesUp((e, manager) => {
            const start = tapStartRef.current;
            tapStartRef.current = null;
            manager.fail();
            const touch = e.changedTouches[0];
            const width = widthRef.current;
            if (!start || !touch || width <= 0) return;
            const isTap =
              Date.now() - start.time <= TAP_MAX_MS &&
              Math.hypot(touch.x - start.x, touch.y - start.y) <= TAP_SLOP;
            if (isTap && touch.x > width / 3 && touch.x < (width * 2) / 3) {
              onCenterTapRef.current?.();
            }
          })
          .onTouchesCancelled((_e, manager) => {
            tapStartRef.current = null;
            manager.fail();
          }),
      []
    );

    const preferences: Preferences = { theme, fontSize };

    log.debug('mounting', { fileUrl });

    return (
      <GestureDetector gesture={centerTapGesture}>
        <View
          style={styles.container}
          onLayout={(e) => {
            widthRef.current = e.nativeEvent.layout.width;
          }}
        >
          <ReadiumView
            ref={innerRef}
            style={styles.reader}
            file={{ url: fileUrl, initialLocation: initialLocator }}
            preferences={preferences}
            onLocationChange={handleLocationChange}
            onPublicationReady={handlePublicationReady}
          />
        </View>
      </GestureDetector>
    );
  }
);

ReaderEpub.displayName = 'ReaderEpub';

export default ReaderEpub;

const styles = StyleSheet.create({
  container: { flex: 1 },
  reader: { flex: 1
  },
});