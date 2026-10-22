// React Native Web ships this module untyped. getSheet is the server-rendering half of its style
// sheet: the rules every rendered style inserted, under the id the browser's sheet adopts.
declare module 'react-native-web/dist/exports/StyleSheet' {
  const StyleSheet: { getSheet(): { id: string; textContent: string } };
  export = StyleSheet;
}
