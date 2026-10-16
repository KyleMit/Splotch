import {
  createDrawingStyles,
  DrawingStatusBar,
  useDrawingStyles,
} from '../drawing/DrawingAppearance';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from 'react-native-safe-area-context';
import { useModalOrigin } from './modalOrigin';
import { PaperTexture } from '../drawing/PaperTexture';

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: palette.paperMargin },
    // Shipping paints the drawing screen's safe-area strips with the palette bar's surface, so
    // the top band reads as an extension of the bar.
    drawing: { flex: 1, backgroundColor: palette.surface },
    // The flat style prints its bar on the paper, so the strips are paper too.
    flatDrawing: { flex: 1, backgroundColor: palette.paper },
    overlay: { flex: 1, backgroundColor: 'transparent' },
    // The provider paints the frame; a second coat on the padded view is a full-screen fill
    // Android draws again on every frame.
    inset: { flex: 1 },
  })
);

const grainStyles = StyleSheet.create({
  strip: { position: 'absolute', overflow: 'hidden' },
  top: { top: 0, left: 0, right: 0 },
  left: { left: 0, bottom: 0 },
  right: { right: 0, bottom: 0 },
});

// Only the padded strips need another grain layer; the paper slot paints the drawing area.
function FlatSafeAreaPaper() {
  const { top, left, right } = useSafeAreaInsets();
  const strips = [
    ['top', top, { height: top }],
    ['left', left, { top: 0, width: left }],
    ['right', right, { top: 0, width: right }],
  ] as const;
  return strips.map(([edge, inset, extent]) =>
    inset > 0 ? (
      <View
        key={edge}
        testID={`rsd-safe-area-grain-${edge}`}
        pointerEvents="none"
        style={[grainStyles.strip, grainStyles[edge], extent]}
      >
        <PaperTexture rightInset={edge === 'right' ? inset : 0} />
      </View>
    ) : null
  );
}

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
      {variant === 'flatDrawing' ? <FlatSafeAreaPaper /> : null}
      <SafeAreaView
        testID="rsd-safe-area-frame"
        mode="padding"
        edges={variant === 'drawing' || variant === 'flatDrawing' ? PAPER_EDGES : ALL_EDGES}
        style={styles.inset}
        onStartShouldSetResponderCapture={(event) => origin?.record(event) ?? false}
      >
        {children}
      </SafeAreaView>
      {edges}
    </SafeAreaProvider>
  );
}
