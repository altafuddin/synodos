const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// markdown-it (via react-native-markdown-display) imports Node's built-in
// "punycode" module, which the React Native runtime does not provide.
// Alias it to the userland "punycode" package so Metro can bundle it.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: require.resolve('punycode/'),
};

module.exports = config;
