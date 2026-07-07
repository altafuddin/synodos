import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react';
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
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
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

    // Natural top-to-bottom order: oldest at index 0 (scroll offset 0 = visual
    // top), newest at the visual bottom. This keeps offset 0 mapped to the true
    // top edge, which is what gorhom v5's collapse-on-offset-0 rule expects —
    // so upward drags toward older messages scroll the list instead of
    // collapsing the sheet (BUG-009). We land on the newest message manually via
    // scrollToEnd in onContentSizeChange (below).
    const data = messages;

    // Ref to drive scrollToEnd once content has laid out.
    const listRef = useRef<ElementRef<typeof BottomSheetFlatList>>(null);

    // Measured height of the pinned footer (input row + its safe-area inset).
    // Newest message sits at the content BOTTOM, so this footer-clearance
    // padding lives on paddingBottom. ~96 fallback keeps the first frame from
    // clipping.
    const [footerHeight, setFooterHeight] = useState(96);

    // Manual footer lift (BUG-008). Under Android 16 edge-to-edge + targetSdk 35
    // the window no longer resizes for the IME, so gorhom's internal
    // useAnimatedKeyboard computes ~0 lift and the pinned footer never rises.
    // Drive the translation ourselves from keyboard-controller's per-frame
    // height SharedValue. Its convention: height.value is 0 when closed and
    // NEGATIVE as the keyboard opens (magnitude = keyboard height), so applying
    // translateY: height.value directly moves the footer UP with the keyboard —
    // no sign flip needed.
    const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
    const footerAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: keyboardHeight.value }],
    }));

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
          <Animated.View
            style={footerAnimatedStyle}
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          >
            <ChatInput onSend={send} disabled={isStreaming} />
          </Animated.View>
        </BottomSheetFooter>
      ),
      [send, isStreaming, footerAnimatedStyle]
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
            ref={listRef}
            style={styles.list}
            data={data}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            // Natural order → land on the newest message after content lays out.
            // scrollToEnd here (not on mount) waits for measured content, so it
            // survives streaming growth and history load without a timing race.
            onContentSizeChange={(_w: number, h: number) => {
              // debug (not info): fires per token during streaming — info
              // would flood the file sink.
              log.debug('content_size_changed', {
                height: Math.round(h),
                messageCount: data.length,
              });
              listRef.current?.scrollToEnd({ animated: false });
            }}
            onLayout={(e: LayoutChangeEvent) =>
              log.info('list_layout', {
                height: Math.round(e.nativeEvent.layout.height),
              })
            }
            // Natural order → newest message is at the content bottom, so the
            // footer-clearance padding goes on paddingBottom to keep it clear of
            // the pinned footer.
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: footerHeight + 8 },
            ]}
            ListEmptyComponent={
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
  // paddingBottom is applied dynamically from the measured footer height (see
  // contentContainerStyle) to keep the newest message clear of the pinned
  // footer. The 8 here is the breathing room at the visual top (oldest message).
  listContent: { paddingTop: 8, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});

export default ChatSheet;