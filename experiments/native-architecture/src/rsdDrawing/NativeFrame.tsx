import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DRAWING_THEME } from '../drawing/theme';

const nativeFrameStyles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: DRAWING_THEME.paperMargin },
});

export function NativeFrame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider testID="rsd-window-insets" style={nativeFrameStyles.frame}>
      <SafeAreaView
        testID="rsd-safe-area-frame"
        mode="padding"
        edges={['top', 'right', 'bottom', 'left']}
        style={nativeFrameStyles.frame}
      >
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
