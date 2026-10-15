import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { paletteSlots } from './paletteGeometry';
import { fittedPaper } from '../drawing/paperGeometry';
import type { PaperReference } from '../drawing/paperSpace';
import {
  INITIAL_PAPER_PRESENTATION,
  presentPaper,
  type PresentedFrame,
  type PaperPresentationState,
  type PaperPresentationInputs,
} from '../drawing/paperPresentation';
import { RsdGlassPanes, RsdMarginRules, RsdRailGlass } from './bareGlass';
import type { BareGlass } from './bareGlassLayout';
import {
  EDGE_INSET_PX,
  isPhoneLandscapeViewport,
  type AreaOffset,
  type AreaSize,
  type LayoutAxis,
} from './edgeLayout';

// endInset is the bottom safe-area inset under the landscape column's far end, which its trim
// leaves out and its end clearance stands above.
export type PaletteLayout = Readonly<{
  axis: LayoutAxis;
  slots: number;
  length: number;
  endInset: number;
}>;

// The shipping palette (--z-palette) stacks over the paper, so its plate's shadow falls on it,
// and over the Clear Button, its accept ring and coachmark.
const PALETTE_OVER_CLEAR_Z_INDEX = 1;

const docks = StyleSheet.create({
  palette: { zIndex: PALETTE_OVER_CLEAR_Z_INDEX },
  floatingRow: { position: 'absolute', top: 0, left: 0, right: 0 },
  floatingColumn: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  // Clipped to the safe-area frame, so the accept ring never paints over the system status bar.
  clearOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  settings: { position: 'absolute', bottom: EDGE_INSET_PX, right: EDGE_INSET_PX },
  controls: { position: 'absolute', top: 0, right: 0, left: 0 },
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

type NativeDrawingLayoutProps = {
  // The flat Button style's glass, or null for the raised style, whose bar sits beside the paper.
  bareGlass: BareGlass | null;
  paper: PaperReference;
  empty: boolean;
  departingPaper: PaperReference | null;
  palette: (layout: PaletteLayout) => ReactNode;
  clearUnderlay: (
    offset: AreaOffset,
    frame: PresentedFrame,
    departingFrame: PresentedFrame | null
  ) => ReactNode;
  clearOverlay: ReactNode;
  actionsPanel: (area: AreaSize, viewport: AreaSize) => ReactNode;
  settings: ReactNode;
  status: ReactNode;
  capturePress: () => boolean;
  // Floats over the paper with the controls, clear of the bottom inset.
  overlays: ReactNode;
  // The paper, which runs under the bottom inset.
  children: (frame: PresentedFrame, space: AreaSize) => ReactNode;
};

function usePresentedPaper(
  { paper, empty, slot, origin, window, toolbarStyle }: PaperPresentationInputs,
  departingPaper: PaperReference | null
) {
  const inputs = useMemo(
    () =>
      ({
        paper,
        empty,
        slot: { width: slot.width, height: slot.height },
        origin: { x: origin.x, y: origin.y },
        window: { width: window.width, height: window.height },
        toolbarStyle,
      }) as const,
    [
      paper,
      empty,
      slot.width,
      slot.height,
      origin.x,
      origin.y,
      window.width,
      window.height,
      toolbarStyle,
    ]
  );
  const [presentation, setPresentation] = useState(INITIAL_PAPER_PRESENTATION);
  const [memory] = useState(() => new WeakMap<PaperReference, PaperPresentationState>());
  const remembered = presentation.inputs?.paper !== paper ? memory.get(paper) : undefined;
  const next =
    presentation.inputs === inputs
      ? presentation
      : presentPaper(remembered ?? presentation, inputs);
  if (next !== presentation) setPresentation(next);
  const frame = next.frame ?? fittedPaper(slot, paper);
  useLayoutEffect(() => {
    if (!empty && paper.kind === 'adopted') memory.set(paper, next);
  }, [empty, paper, memory, next]);
  const departingFrame =
    departingPaper === paper
      ? frame
      : departingPaper &&
        (presentPaper(memory.get(departingPaper) ?? INITIAL_PAPER_PRESENTATION, {
          ...inputs,
          paper: departingPaper,
          empty: false,
        }).frame ??
          fittedPaper(slot, departingPaper));
  return { frame, departingFrame };
}

function NativePaletteBar({
  axis,
  bare,
  onMeasure,
  children,
}: {
  axis: LayoutAxis;
  bare: boolean;
  onMeasure: (length: number) => void;
  children: ReactNode;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  return (
    <View
      testID="rsd-palette-bar"
      style={[
        drawingScreenStyles.paletteBar,
        docks.palette,
        bare && (axis === 'row' ? docks.floatingRow : docks.floatingColumn),
      ]}
      onLayout={({ nativeEvent }) =>
        onMeasure(axis === 'row' ? nativeEvent.layout.width : nativeEvent.layout.height)
      }
    >
      {bare ? <RsdRailGlass axis={axis} /> : null}
      {children}
    </View>
  );
}

// The shipping arrangement: colors along the top edge (the left edge in landscape, and none on a
// landscape phone, whose Actions Panel carries the Color Button instead), Clear docked to
// the right screen edge, Settings in the bottom-right corner and the Actions Panel in the
// bottom-left one, all floating over a paper area that takes the rest of the screen. The panel
// places itself inside that area (edgeLayout.ts), sized against the area and the window. The
// clear underlay paints over the paper in the area's coordinates; the clear overlay spans the whole
// layout, as the shipping Clear Button docks to the screen rather than the paper. Every press
// anywhere in the layout passes through capturePress first, without being claimed.
export function NativeDrawingLayout({
  bareGlass,
  paper,
  empty,
  departingPaper,
  palette,
  clearUnderlay,
  clearOverlay,
  actionsPanel,
  settings,
  status,
  capturePress,
  overlays,
  children,
}: NativeDrawingLayoutProps) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const window = useWindowDimensions();
  const axis = window.width > window.height ? 'column' : 'row';
  const [measured, setMeasured] = useState<{ axis: LayoutAxis; length: number }>();
  // Shipping's paper runs under the home indicator while its controls sit clear of it; the frame
  // leaves the bottom inset unpadded (NativeFrame) and the controls take it back here.
  const insetBottom = useSafeAreaInsets().bottom;
  const endInset = axis === 'column' ? insetBottom : 0;
  // Shipping trims by the viewport's own length, insets included, and clips what an inset
  // shortens the bar by; only the spacing follows the bar's measured length. The landscape column
  // alone trims short of the bottom inset: there shipping's own last swatch overruns into the home
  // indicator (safe-area-matrix.spec.ts), and More colors, which never trims, must stay reachable.
  const viewportLength = axis === 'row' ? window.width : window.height;
  const length = measured?.axis === axis ? measured.length : viewportLength;
  // Until the paper area reports its size, the window bounds it from above.
  const [area, setArea] = useState<Box>();
  const [root, setRoot] = useState<Box>();
  const [column, setColumn] = useState<Box>();
  const paperArea = area ?? window;
  const phoneLandscape = isPhoneLandscapeViewport(window);
  const { frame, departingFrame } = usePresentedPaper(
    {
      paper,
      empty,
      slot: paperArea,
      origin: {
        x: (root?.x ?? 0) + (column?.x ?? 0) + (area?.x ?? 0),
        y: (root?.y ?? 0) + (column?.y ?? 0) + (area?.y ?? 0),
      },
      window,
      toolbarStyle: bareGlass ? 'bare' : 'buttons',
    },
    departingPaper
  );
  const paperNode = useMemo(
    () => children(frame, { width: paperArea.width, height: paperArea.height }),
    [children, frame, paperArea.width, paperArea.height]
  );
  const controlArea = { width: paperArea.width, height: paperArea.height - insetBottom };
  return (
    <View
      testID="rsd-drawing-layout"
      onLayout={boxSetter(setRoot)}
      onStartShouldSetResponderCapture={capturePress}
      style={[
        drawingScreenStyles.fullBleed,
        axis === 'column' && drawingScreenStyles.fullBleedLandscape,
      ]}
    >
      {phoneLandscape ? null : (
        <NativePaletteBar
          axis={axis}
          bare={Boolean(bareGlass)}
          onMeasure={(length) =>
            setMeasured((previous) =>
              previous?.axis === axis && previous.length === length ? previous : { axis, length }
            )
          }
        >
          {palette({
            axis,
            slots: paletteSlots(viewportLength - endInset, axis),
            length,
            endInset,
          })}
        </NativePaletteBar>
      )}
      {bareGlass && !phoneLandscape ? <RsdMarginRules axis={axis} /> : null}
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
          {paperNode}
          {bareGlass ? (
            <RsdGlassPanes
              space={{
                width: paperArea.width,
                height: paperArea.height,
                insetBottom,
                paperTop: 0,
                paperLeft: 0,
              }}
              glass={bareGlass}
            />
          ) : null}
          {clearUnderlay(areaOffset(root, column, area), frame, departingFrame)}
          <View
            testID="rsd-controls-inset"
            pointerEvents="box-none"
            style={[docks.controls, { bottom: insetBottom }]}
          >
            {overlays}
            <View testID="rsd-settings-dock" style={docks.settings}>
              {settings}
            </View>
            {actionsPanel(controlArea, window)}
            {status}
          </View>
        </View>
      </View>
      <View testID="rsd-clear-overlay" pointerEvents="box-none" style={docks.clearOverlay}>
        {clearOverlay}
      </View>
    </View>
  );
}
