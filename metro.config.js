const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.transformIgnorePatterns = [
  'node_modules/(?!((@react-native|react-native|expo|@expo|@expo/vector-icons|@supabase/realtime-js|@supabase/supabase-js)/|sentry-expo/|native-base/|react-native-svg/))',
];

module.exports = config;
