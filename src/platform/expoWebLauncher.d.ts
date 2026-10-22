// Expo's web launcher (registerRoot.web.ts) is TypeScript source, so the checker reads its imports
// too; its async-require reads the DOM-component props global, which only expo/src/dom declares.
interface Window {
  $$EXPO_INITIAL_PROPS?: unknown;
}
