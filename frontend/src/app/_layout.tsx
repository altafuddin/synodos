import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { themes } from '../constants/themes';
import { useBookStore } from '../stores/bookStore';

function AppShell() {
  const theme = useBookStore((s) => s.theme);
  const paperTheme = themes[theme];

  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: paperTheme.colors.surface },
          headerTintColor: paperTheme.colors.primary,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: paperTheme.colors.background },
        }}
      />
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* preload={false}: no input on the initial screen, and preload causes a
          documented keyboard flash on launch. Under edge-to-edge the provider
          auto-manages translucent bars / preserveEdgeToEdge — do not set manually. */}
      <KeyboardProvider preload={false}>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <AppShell />
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}