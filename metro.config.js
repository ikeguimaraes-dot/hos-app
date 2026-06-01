const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Transpila pacotes Supabase e React Native que usam private class fields
// (necessário para Hermes no Expo SDK 54)
config.transformIgnorePatterns = [
  'node_modules/(?!((@react-native|react-native|expo|@expo|@expo/vector-icons|@supabase/realtime-js|@supabase/supabase-js)/|sentry-expo/|native-base/|react-native-svg/))',
];

module.exports = config;
