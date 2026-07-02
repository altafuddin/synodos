import { forwardRef, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetFooter,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useChat } from '../hooks/useChat';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import type { ChatMessage as ChatMessageType } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('ChatSheet');

type ChatSheetProps = {
  bookId: string;
};

// Half-screen draggable chat drawer over the reader. The parent holds the ref
// and calls .present() to open. State lives entirely in useChat.
const ChatSheet = forwardRef<BottomSheetModal, ChatSheetProps>(
  ({ bookId }, ref) => {
    const theme = useTheme();
    const { messages, isStreaming, send } = useChat(bookId);

    const snapPoints = useMemo(() => ['50%', '85%'], []);

    // INVERTED list: newest message at data index 0 renders at scroll offset 0,
    // i.e. the visual bottom. The list therefore opens pinned to the newest
    // message BY DEFINITION — no scrollToEnd, no timing race, no measurement
    // dependency (this replaces all the scroll machinery we deleted). New
    // messages prepend at offset 0 and the view stays pinned to newest, while a
    // user scrolled up keeps their position (WhatsApp behaviour).
    //
    // We reverse a shallow copy at the render boundary; useChat keeps its natural
    // oldest-first order untouched. Keys stay stable (message id, via
    // keyExtractor) so React reuses rows across prepends with no flicker.
    const data = useMemo(() => [...messages].reverse(), [messages]);

    // Measured height of the pinned footer (input row + its safe-area inset).
    // Under inversion the newest message sits at the CONTENT top (= visual
    // bottom), so this footer-clearance padding lives on paddingTop, not
    // paddingBottom. ~96 fallback keeps the first frame from clipping.
    const [footerHeight, setFooterHeight] = useState(96);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="collapse"
        />
      ),
      []
    );

    const renderItem = useCallback(
      ({ item }: { item: ChatMessageType }) => <ChatMessage message={item} />,
      []
    );

    const keyExtractor = useCallback(
      (item: ChatMessageType, index: number) => item.id ?? String(index),
      []
    );

    // Pinned footer. Memoized on [send, isStreaming] only — NOT on draft text
    // (that's local to ChatInput now), so it doesn't remount per keystroke and
    // the input keeps focus. It re-mounts when isStreaming flips, which also
    // clears the field and drops the keyboard after a send.
    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props}>
          <View
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          >
            <ChatInput onSend={send} disabled={isStreaming} />
          </View>
        </BottomSheetFooter>
      ),
      [send, isStreaming]
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        footerComponent={renderFooter}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.outline }}
      >
        <View style={styles.container}>
          <BottomSheetFlatList
            inverted
            style={styles.list}
            data={data}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            // Logs kept for one more verify round — no scroll work: inversion
            // pins the view to the newest message on its own.
            onContentSizeChange={(_w: number, h: number) =>
              log.info('content_size_changed', {
                height: Math.round(h),
                messageCount: data.length,
              })
            }
            onLayout={(e: LayoutChangeEvent) =>
              log.info('list_layout', {
                height: Math.round(e.nativeEvent.layout.height),
              })
            }
            // Inverted → content top is the visual bottom, so the footer-clearance
            // padding goes on paddingTop. A small paddingBottom gives the oldest
            // message breathing room under the drag handle (visual top).
            contentContainerStyle={[
              styles.listContent,
              { paddingTop: footerHeight + 8 },
            ]}
            ListEmptyComponent={
              // Counter-rotate: the inverted list applies scaleY(-1), which would
              // otherwise render the empty prompt upside down.
              <View style={styles.empty}>
                <Text style={{ color: theme.colors.onSurface, opacity: 0.6 }}>
                  Ask anything about what you&apos;ve read so far.
                </Text>
              </View>
            }
          />
        </View>
      </BottomSheetModal>
    );
  }
);

ChatSheet.displayName = 'ChatSheet';

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  // paddingTop is applied dynamically from the measured footer height (see
  // contentContainerStyle). Under inversion the content top is the visual bottom,
  // so this is what keeps the newest message clear of the pinned footer. The 8
  // here is the breathing room at the visual top (oldest message).
  listContent: { paddingBottom: 8, flexGrow: 1 },
  // scaleY:-1 counter-rotates against the inverted list's own scaleY(-1) so the
  // empty prompt renders upright.
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    transform: [{ scaleY: -1 }],
  },
});

export default ChatSheet;