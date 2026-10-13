import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { paletteSlots } from './paletteGeometry';
import {
  drawerOffsets,
  EDGE_INSET_PX,
  type AreaOffset,
  type AreaSize,
  type LayoutAxis,
} from './edgeLayout';

export type PaletteLayout = Readonly<{ axis: LayoutAxis; slots: number; length: number }>;
export type DrawerTool = Readonly<{ label: string; node: ReactNode }>;

// The shipping palette (--z-palette) stacks over the paper, so its plate's shadow falls on it,
// and over the Clear Button, its accept ring and coachmark.
const PALETTE_OVER_CLEAR_Z_INDEX = 1;

const docks = StyleSheet.create({
  palette: { zIndex: PALETTE_OVER_CLEAR_Z_INDEX },
  // Clipped to the safe-area frame, so the accept ring never paints over the system status bar.
  clearOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  settings: { position: 'absolute', bottom: EDGE_INSET_PX, right: EDGE_INSET_PX },
  toggle: { position: 'absolute', bottom: EDGE_INSET_PX, left: EDGE_INSET_PX },
  tool: { position: 'absolute' },
});

type Box = Readonly<{ x: number; y: number; width: number; height: number }>;

function sameSize(previous: AreaSize | undefined, next: AreaSize) {
  return previous?.width === next.width && previous.height === next.height;
}

function sameBox(previous: Box | undefined, next: Box) {
  return sameSize(previous, next) && previous?.x === next.x && previous.y === next.y;
}

// The paper area's distance from the layout's top and right edges, from the area's box inside its
// column and the column's box inside the layout.
function areaOffset(root: Box | undefined, column: Box | undefined, area: Box | undefined) {
  if (!root || !column || !area) return { top: 0, right: 0 };
  return {
    top: column.y + area.y,
    right: root.width - (column.x + area.x + area.width),
  };
}

function boxSetter(set: (update: (previous: Box | undefined) => Box | undefined) => void) {
  return ({ nativeEvent }: { nativeEvent: { layout: Box } }) => {
    const { x, y, width, height } = nativeEvent.layout;
    const next = { x, y, width, height };
    set((previous) => (sameBox(previous, next) ? previous : next));
  };
}

// The shipping arrangement: colors along the top edge (the left edge in landscape), Clear docked to
// the right screen edge, Settings in the bottom-right corner and the tool drawer's chevron in the
// bottom-left one, all floating over a paper area that takes the rest of the screen. The open
// drawer's tools are placed by drawerOffsets so they stay inside that area and clear of Clear and
// Settings. The clear underlay paints over the paper in the area's coordinates; the clear overlay
// spans the whole layout, as the shipping Clear Button docks to the screen rather than the paper.
export function NativeDrawingLayout({
  controlSize,
  palette,
  clearUnderlay,
  clearOverlay,
  drawerToggle,
  drawerTools,
  settings,
  status,
  children,
}: {
  controlSize: number;
  palette: (layout: PaletteLayout) => ReactNode;
  clearUnderlay: (offset: AreaOffset) => ReactNode;
  clearOverlay: ReactNode;
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
  // Shipping trims by the viewport's own length, insets included, and clips what an inset
  // shortens the bar by; only the spacing follows the bar's measured length.
  const viewportLength = axis === 'row' ? window.width : window.height;
  const length = measured?.axis === axis ? measured.length : viewportLength;
  // Until the paper area reports its size, the window bounds it from above.
  const [area, setArea] = useState<Box>();
  const [root, setRoot] = useState<Box>();
  const [column, setColumn] = useState<Box>();
  const offsets = drawerOffsets(area ?? window, drawerAxis, drawerTools.length, controlSize);
  return (
    <View
      testID="rsd-drawing-layout"
      onLayout={boxSetter(setRoot)}
      style={[
        drawingScreenStyles.fullBleed,
        axis === 'column' && drawingScreenStyles.fullBleedLandscape,
      ]}
    >
      <View
        testID="rsd-palette-bar"
        style={[drawingScreenStyles.paletteBar, docks.palette]}
        onLayout={({ nativeEvent }) => {
          const next = axis === 'row' ? nativeEvent.layout.width : nativeEvent.layout.height;
          setMeasured((previous) =>
            previous?.axis === axis && previous.length === next ? previous : { axis, length: next }
          );
        }}
      >
        {palette({ axis, slots: paletteSlots(viewportLength, axis), length })}
      </View>
      <View
        testID="rsd-canvas-column"
        style={drawingScreenStyles.canvasColumn}
        onLayout={boxSetter(setColumn)}
      >
        <View
          testID="rsd-canvas-area"
          style={drawingScreenStyles.canvasArea}
          onLayout={boxSetter(setArea)}
        >
          {children}
          {clearUnderlay(areaOffset(root, column, area))}
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
          {status}
        </View>
      </View>
      <View testID="rsd-clear-overlay" pointerEvents="box-none" style={docks.clearOverlay}>
        {clearOverlay}
      </View>
    </View>
  );
}
