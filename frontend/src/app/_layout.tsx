import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { darkTheme } from '../constants/themes';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={darkTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#1a1a1a' },
            headerTintColor: '#c9a84c',
            headerTitleStyle: { fontWeight: 'bold' },
            contentStyle: { backgroundColor: '#0d0d0d' },
          }}
        />
      </PaperProvider>
    </GestureHandlerRootView>
  );
}