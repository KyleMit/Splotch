import {
  createDrawingStyles,
  DrawingStatusBar,
  useDrawingStyles,
} from '../drawing/DrawingAppearance';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useModalOrigin } from './modalOrigin';

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: palette.paperMargin },
    overlay: { flex: 1, backgroundColor: 'transparent' },
  })
);

export function NativeFrame({
  children,
  variant = 'screen',
}: {
  children: ReactNode;
  variant?: 'screen' | 'overlay';
}) {
  const styles = useDrawingStyles(themedStyles);
  const frame = variant === 'overlay' ? styles.overlay : styles.frame;
  const origin = useModalOrigin();
  return (
    <SafeAreaProvider
      testID="rsd-window-insets"
      initialMetrics={initialWindowMetrics}
      style={frame}
    >
      <DrawingStatusBar />
      <SafeAreaView
        testID="rsd-safe-area-frame"
        mode="padding"
        edges={['top', 'right', 'bottom', 'left']}
        style={frame}
        onStartShouldSetResponderCapture={(event) => origin?.record(event) ?? false}
      >
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
