// The expo package's index also re-exports Expo's native-module runtime (expo-modules-core), which
// no web module uses. Its web launcher runs the same web setup (Expo.fx.web.tsx: async-require for
// the lazy chunks, then Expo's winter globals) without that runtime.
export { default as registerRootComponent } from 'expo/src/launch/registerRootComponent';
