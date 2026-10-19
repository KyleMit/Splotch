import StyleSheet from 'react-native-web/dist/exports/StyleSheet';

// React Native Web's rules for everything rendered so far. The browser's sheet takes over the
// <style> element with this id instead of creating its own (StyleSheet/dom/createCSSStyleSheet).
export function getSheet() {
  return StyleSheet.getSheet();
}
