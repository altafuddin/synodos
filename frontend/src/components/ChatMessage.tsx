import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import type { ChatMessage as ChatMessageType } from '../types';

type ChatMessageProps = {
  message: ChatMessageType;
};

// Pure bubble. memo + stable message identity (see useChat) means only the
// streaming assistant bubble re-renders as tokens arrive — the rest bail out.
function ChatMessage({ message }: ChatMessageProps) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const textColor = isUser ? theme.colors.onPrimary : theme.colors.onSurface;

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
        <Markdown style={markdownStyles(textColor)}>
          {message.content}
        </Markdown>
      </View>
    </View>
  );
}

// Maps markdown elements to the bubble's text color so assistant/user
// bubbles keep matching contrast. Code blocks get a subtle translucent
// tint that reads on both surfaceVariant and primary backgrounds.
const markdownStyles = (color: string) => ({
  body: { color, margin: 0 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  strong: { color, fontWeight: '700' as const },
  em: { color, fontStyle: 'italic' as const },
  heading1: { color, fontWeight: '700' as const },
  heading2: { color, fontWeight: '700' as const },
  heading3: { color, fontWeight: '700' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  bullet_list_icon: { color },
  ordered_list_icon: { color },
  list_item: { color },
  blockquote: {
    color,
    backgroundColor: 'rgba(127, 127, 127, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: color,
    paddingHorizontal: 8,
  },
  code_inline: {
    color,
    backgroundColor: 'rgba(127, 127, 127, 0.2)',
    fontFamily: 'monospace',
  },
  code_block: {
    color,
    backgroundColor: 'rgba(127, 127, 127, 0.2)',
    fontFamily: 'monospace',
  },
  fence: {
    color,
    backgroundColor: 'rgba(127, 127, 127, 0.2)',
    fontFamily: 'monospace',
  },
  link: { color, textDecorationLine: 'underline' as const },
  hr: { backgroundColor: color },
});

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 4, paddingHorizontal: 12 },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4 },
});

export default memo(ChatMessage);