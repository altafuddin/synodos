import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { ChatMessage as ChatMessageType } from '../types';

type ChatMessageProps = {
  message: ChatMessageType;
};

// Pure bubble. memo + stable message identity (see useChat) means only the
// streaming assistant bubble re-renders as tokens arrive — the rest bail out.
function ChatMessage({ message }: ChatMessageProps) {
  const theme = useTheme();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          {
            backgroundColor: isUser
              ? theme.colors.primary
              : theme.colors.surfaceVariant,
          },
        ]}
      >
        <Text
          style={{
            color: isUser ? theme.colors.onPrimary : theme.colors.onSurface,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 4, paddingHorizontal: 12 },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4 },
});

export default memo(ChatMessage);