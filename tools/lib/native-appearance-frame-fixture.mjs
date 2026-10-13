import { createElement } from 'react';
import { View } from 'react-native';

export const initialWindowMetrics = null;

export function SafeAreaProvider({ children, style, testID }) {
  return createElement(View, { style, testID }, children);
}

export function SafeAreaView({ children, style, testID }) {
  return createElement(View, { style, testID }, children);
}

const NO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export function useSafeAreaInsets() {
  return NO_INSETS;
}
