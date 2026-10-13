import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { paletteSlots } from './paletteGeometry';
import { drawerOffsets, EDGE_INSET_PX, type AreaSize, type LayoutAxis } from './edgeLayout';

export type PaletteLayout = Readonly<{ axis: LayoutAxis; slots: number; length: number }>;
export type DrawerTool = Readonly<{ label: string; node: ReactNode }>;

const docks = StyleSheet.create({
  clear: { position: 'absolute', top: EDGE_INSET_PX, right: EDGE_INSET_PX },
  settings: { position: 'absolute', bottom: EDGE_INSET_PX, right: EDGE_INSET_PX },
  toggle: { position: 'absolute', bottom: EDGE_INSET_PX, left: EDGE_INSET_PX },
  tool: { position: 'absolute' },
});

function sameSize(previous: AreaSize | undefined, next: AreaSize) {
  return previous?.width === next.width && previous.height === next.height;
}

// The shipping arrangement: colors along the top edge (the left edge in landscape), Clear on the
// right edge, Settings in the bottom-right corner and the tool drawer's chevron in the bottom-left
// one, all floating over a paper area that takes the rest of the screen. The open drawer's tools
// are placed by drawerOffsets so they stay inside that area and clear of Clear and Settings.
export function NativeDrawingLayout({
  controlSize,
  palette,
  clear,
  clearUnderlay,
  clearCoachmark,
  drawerToggle,
  drawerTools,
  settings,
  status,
  children,
}: {
  controlSize: number;
  palette: (layout: PaletteLayout) => ReactNode;
  clear: ReactNode;
  clearUnderlay: ReactNode;
  clearCoachmark: ReactNode;
  drawerToggle: (axis: LayoutAxis) => ReactNode;
  drawerTools: readonly DrawerTool[];
  settings: ReactNode;
  status: ReactNode;
  children: ReactNode;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const window = useWindowDimensions();
  const axis = window.width > window.height ? 'column' : 'row';
  const drawerAxis = axis === 'row' ? 'column' : 'row';
  const [measured, setMeasured] = useState<{ axis: LayoutAxis; length: number }>();
  const length =
    measured?.axis === axis ? measured.length : axis === 'row' ? window.width : window.height;
  // Until the paper area reports its size, the window bounds it from above.
  const [area, setArea] = useState<AreaSize>();
  const offsets = drawerOffsets(area ?? window, drawerAxis, drawerTools.length, controlSize);
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
        {palette({ axis, slots: paletteSlots(length, axis), length })}
      </View>
      <View style={drawingScreenStyles.canvasColumn}>
        <View
          testID="rsd-canvas-area"
          style={drawingScreenStyles.canvasArea}
          onLayout={({ nativeEvent }) => {
            const { width, height } = nativeEvent.layout;
            setArea((previous) =>
              sameSize(previous, { width, height }) ? previous : { width, height }
            );
          }}
        >
          {children}
          {clearUnderlay}
          <View testID="rsd-settings-dock" style={docks.settings}>
            {settings}
          </View>
          {drawerTools.map((tool, index) => (
            <View key={tool.label} testID="rsd-drawer-tool" style={[docks.tool, offsets[index]]}>
              {tool.node}
            </View>
          ))}
          <View testID="rsd-drawer-dock" style={docks.toggle}>
            {drawerToggle(drawerAxis)}
          </View>
          <View testID="rsd-clear-dock" style={docks.clear}>
            {clear}
          </View>
          {clearCoachmark}
          {status}
        </View>
      </View>
    </View>
  );
}
