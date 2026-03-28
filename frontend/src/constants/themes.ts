import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#c9a84c',
    background: '#0d0d0d',
    surface: '#1a1a1a',
    onBackground: '#e8e0d0',
    onSurface: '#e8e0d0',
    surfaceVariant: '#2a2a2a',
    outline: '#3a3a3a',
  },
};

export const sepiaTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#8b5e3c',
    background: '#f4ede0',
    surface: '#ede0cc',
    onBackground: '#3b2f1e',
    onSurface: '#3b2f1e',
    surfaceVariant: '#e0d0b8',
    outline: '#b89a74',
  },
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1a73e8',
    background: '#ffffff',
    surface: '#f5f5f5',
    onBackground: '#1c1c1e',
    onSurface: '#1c1c1e',
    surfaceVariant: '#e8e8e8',
    outline: '#c7c7cc',
  },
};

export type ThemeName = 'dark' | 'sepia' | 'light';

export const themes: Record<ThemeName, MD3Theme> = {
  dark: darkTheme,
  sepia: sepiaTheme,
  light: lightTheme,
};