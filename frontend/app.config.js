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

module.exports = ({ config }) => ({
  ...config,
  name: APP_NAME,
  android: {
    ...config.android,
    package: IDENTIFIER,
  },
  ios: {
    ...config.ios,
    bundleIdentifier: IDENTIFIER,
  },
});
