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
  type Edge,
} from 'react-native-safe-area-context';
import { useModalOrigin } from './modalOrigin';

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: palette.paperMargin },
    // Shipping paints the drawing screen's safe-area strips with the palette bar's surface, so
    // the top band reads as an extension of the bar.
    drawing: { flex: 1, backgroundColor: palette.surface },
    // The flat style prints its bar on the paper, so the strips are paper too.
    flatDrawing: { flex: 1, backgroundColor: palette.paper },
    overlay: { flex: 1, backgroundColor: 'transparent' },
  })
);

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
// The drawing paper runs under the bottom inset (the home indicator) as shipping's canvas does;
// NativeDrawingLayout lifts the controls clear of it (docs/SAFE-AREA.md).
const PAPER_EDGES: readonly Edge[] = ['top', 'right', 'left'];

export function NativeFrame({
  children,
  variant = 'screen',
  edges,
}: {
  children: ReactNode;
  variant?: 'screen' | 'drawing' | 'flatDrawing' | 'overlay';
  // Painted over the safe-area strips the frame's padding leaves (the drawing screen's Notch Band),
  // in this frame's own inset coordinates.
  edges?: ReactNode;
}) {
  const styles = useDrawingStyles(themedStyles);
  const frame = {
    screen: styles.frame,
    drawing: styles.drawing,
    flatDrawing: styles.flatDrawing,
    overlay: styles.overlay,
  }[variant];
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
        edges={variant === 'drawing' || variant === 'flatDrawing' ? PAPER_EDGES : ALL_EDGES}
        style={frame}
        onStartShouldSetResponderCapture={(event) => origin?.record(event) ?? false}
      >
        {children}
      </SafeAreaView>
      {edges}
    </SafeAreaProvider>
  );
}
