// Dynamic Expo config layered on top of app.json (the static base).
// APP_VARIANT selects a distinct identity per build profile so dev, preview,
// and production builds can coexist on one device.
// Unset APP_VARIANT resolves to the PRODUCTION identity.
const VARIANT = process.env.APP_VARIANT;

const IDENTIFIER = {
  development: 'com.synodos.app.dev',
  preview: 'com.synodos.app.preview',
}[VARIANT] || 'com.synodos.app';

const APP_NAME = {
  development: 'Synodos (Dev)',
  preview: 'Synodos (Preview)',
}[VARIANT] || 'Synodos';

// Development gets its own (amber) icon; preview and production keep whatever
// app.json defines. `current` is passed in from the spread config so app.json
// stays the single source of truth for the non-dev asset.
const iconAsset = (current) =>
  VARIANT === 'development' ? './assets/images/adaptive-icon-dev.png' : current;

module.exports = ({ config }) => ({
  ...config,
  name: APP_NAME,
  icon: iconAsset(config.icon),
  android: {
    ...config.android,
    package: IDENTIFIER,
    adaptiveIcon: {
      ...config.android?.adaptiveIcon,
      foregroundImage: iconAsset(config.android?.adaptiveIcon?.foregroundImage),
    },
  },
  ios: {
    ...config.ios,
    bundleIdentifier: IDENTIFIER,
  },
});
