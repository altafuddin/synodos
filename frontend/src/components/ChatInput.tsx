import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

// Presentational input row, but owns its own draft text via local state. Keeping
// the draft local means the pinned BottomSheetFooter subtree doesn't re-render on
// every keystroke (which would blur the field). Send is gated on
// (non-blank && !disabled); `disabled` tracks isStreaming.
function ChatInput({ onSend, disabled }: ChatInputProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          // Clear the Android nav bar when the keyboard is down.
          paddingBottom: 6 + insets.bottom,
        },
      ]}
    >
      <BottomSheetTextInput
        style={[
          styles.input,
          {
            color: theme.colors.onSurface,
            backgroundColor: theme.colors.surfaceVariant,
          },
        ]}
        placeholder="Ask about what you've read…"
        placeholderTextColor={theme.colors.outline}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
      />
      <IconButton
        icon="send"
        onPress={handleSend}
        disabled={!canSend}
        iconColor={theme.colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 16,
  },
});

export default memo(ChatInput);