import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

const styles = StyleSheet.create({ fill: { flex: 1 } });

export function DrawingKeyboardScope({ children }: { enabled: boolean; children: ReactNode }) {
  return <>{children}</>;
}

export function ModalKeyboardScope({
  enabled: _enabled,
  onEscape: _onEscape,
  style,
  ...props
}: ViewProps & { enabled: boolean; onEscape: () => void }) {
  return <View {...props} style={[styles.fill, style]} />;
}
