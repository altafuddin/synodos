import { StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import API_BASE_URL from '../constants/api';

const updateLabel = Updates.isEmbeddedLaunch
  ? 'Embedded (no OTA update)'
  : Updates.updateId;

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();

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
            Settings
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.row}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            API URL
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {API_BASE_URL}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Update
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {updateLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 48 },
  body: { flex: 1, padding: 16 },
  row: { marginBottom: 24 },
});
