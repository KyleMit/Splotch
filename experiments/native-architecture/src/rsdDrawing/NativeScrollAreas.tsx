import { useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { CONTROL_GAP, TOUCH_TARGET } from '../drawing/theme';

export type LayoutAxis = 'row' | 'column';
export type PaletteLayout = Readonly<{ axis: LayoutAxis; slots: number }>;

// The bar pads each end by one gap and spaces its swatches a gap apart.
export function paletteSlots(length: number) {
  return Math.max(0, Math.floor((length - CONTROL_GAP) / (TOUCH_TARGET + CONTROL_GAP)));
}

// The shipping arrangement: colors along the top edge (the left edge in landscape), Clear on the
// right edge, Settings in the bottom-right corner and the tool drawer in the bottom-left one, all
// floating over a paper area that takes the rest of the screen.
export function NativeDrawingLayout({
  palette,
  clear,
  drawer,
  settings,
  status,
  children,
}: {
  palette: (layout: PaletteLayout) => ReactNode;
  clear: ReactNode;
  drawer: (axis: LayoutAxis) => ReactNode;
  settings: ReactNode;
  status: ReactNode;
  children: ReactNode;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const { width, height } = useWindowDimensions();
  const axis = width > height ? 'column' : 'row';
  const [measured, setMeasured] = useState<{ axis: LayoutAxis; length: number }>();
  const length = measured?.axis === axis ? measured.length : axis === 'row' ? width : height;
  return (
    <View
      testID="rsd-drawing-layout"
      style={[
        drawingScreenStyles.fullBleed,
        axis === 'column' && drawingScreenStyles.fullBleedLandscape,
      ]}
    >
      <View
        testID="rsd-palette-bar"
        style={drawingScreenStyles.paletteBar}
        onLayout={({ nativeEvent }) => {
          const next = axis === 'row' ? nativeEvent.layout.width : nativeEvent.layout.height;
          setMeasured((previous) =>
            previous?.axis === axis && previous.length === next ? previous : { axis, length: next }
          );
        }}
      >
        {palette({ axis, slots: paletteSlots(length) })}
      </View>
      <View style={drawingScreenStyles.canvasColumn}>
        <View testID="rsd-canvas-area" style={drawingScreenStyles.canvasArea}>
          {children}
          <View testID="rsd-clear-dock" style={drawingScreenStyles.clearDock}>
            {clear}
          </View>
          <View testID="rsd-drawer-dock" style={drawingScreenStyles.drawerDock}>
            {drawer(axis === 'row' ? 'column' : 'row')}
          </View>
          <View testID="rsd-settings-dock" style={drawingScreenStyles.settingsDock}>
            {settings}
          </View>
        </View>
        {status}
      </View>
    </View>
  );
}

export function NativeDrawingStatus({
  drawing,
  children,
}: {
  drawing: boolean;
  children: ReactNode;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  return (
    <ScrollView
      testID="rsd-drawing-status-viewport"
      accessibilityLabel="Drawing status"
      accessible={false}
      style={drawingScreenStyles.feedback}
      contentContainerStyle={drawingScreenStyles.feedbackContent}
      removeClippedSubviews={false}
      scrollEnabled={!drawing}
    >
      {children}
    </ScrollView>
  );
}
