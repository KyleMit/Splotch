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
    // Shipping paints the drawing screen's safe-area strips with the palette bar's surface, so
    // the top band reads as an extension of the bar.
    drawing: { flex: 1, backgroundColor: palette.surface },
    overlay: { flex: 1, backgroundColor: 'transparent' },
  })
);

export function NativeFrame({
  children,
  variant = 'screen',
  edges,
}: {
  children: ReactNode;
  variant?: 'screen' | 'drawing' | 'overlay';
  // Painted over the safe-area strips the frame's padding leaves (the drawing screen's Notch Band),
  // in this frame's own inset coordinates.
  edges?: ReactNode;
}) {
  const styles = useDrawingStyles(themedStyles);
  const frame = { screen: styles.frame, drawing: styles.drawing, overlay: styles.overlay }[variant];
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
      {edges}
    </SafeAreaProvider>
  );
}
