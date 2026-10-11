import {
  createDrawingStyles,
  DrawingStatusBar,
  useDrawingStyles,
} from '../drawing/DrawingAppearance';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: palette.paperMargin },
  })
);

export function NativeFrame({ children }: { children: ReactNode }) {
  const nativeFrameStyles = useDrawingStyles(themedStyles);
  return (
    <SafeAreaProvider testID="rsd-window-insets" style={nativeFrameStyles.frame}>
      <DrawingStatusBar />
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
