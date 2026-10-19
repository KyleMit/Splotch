import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useMeasuredPaperArea } from './useMeasuredPaperArea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { PALETTE_FLOWS, paletteAxis, paletteSlots } from './paletteGeometry';
import { fittedPaper } from '../drawing/paperGeometry';
import { paperProjection, type PaperProjection, type PaperReference } from '../drawing/paperSpace';
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
  sameBox,
  type AreaBox as Box,
  isPhoneLandscapeViewport,
  type AreaOffset,
  type AreaSize,
  type LayoutAxis,
} from './edgeLayout';
import { useSecondTouchLayout, SecondTouchRouteScope } from './secondTouchPress';

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
  // Clipped at the safe-area top, so nothing the Clear gesture draws paints over the system status
  // bar, and at the screen's sides, which shipping's fixed Clear Button reaches: docked, its tab
  // overhangs the frame's edge into a landscape side inset. The overlay itself keeps the frame's
  // box, the coordinates the dock is measured in.
  clearClip: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  clearOverlay: { position: 'absolute', top: 0, bottom: 0 },
  window: { position: 'absolute', bottom: 0 },
  settings: { position: 'absolute', bottom: EDGE_INSET_PX, right: EDGE_INSET_PX },
  controls: { position: 'absolute', top: 0, right: 0, left: 0 },
});

function paperOrigin(root: Box | undefined, column: Box | undefined, area: Box | undefined) {
  return {
    x: (root?.x ?? 0) + (column?.x ?? 0) + (area?.x ?? 0),
    y: (root?.y ?? 0) + (column?.y ?? 0) + (area?.y ?? 0),
  };
}

function glassPaperSpace(area: AreaSize, insetBottom: number) {
  return { width: area.width, height: area.height, insetBottom, paperTop: 0, paperLeft: 0 };
}

// A fallback window is not a measured paper area and cannot re-adopt existing ink.
function unmeasuredPaperSpace(
  paper: PaperReference,
  window: AreaSize,
  memory: WeakMap<PaperReference, PaperPresentationState>
) {
  return paper.kind === 'adopted'
    ? paperProjection(paper, memory.get(paper)?.extent ?? undefined).extent
    : window;
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

function insetControlsArea(area: AreaSize, left: number, bottom: number): AreaSize {
  return { width: area.width - left, height: area.height - bottom };
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
  paperPresentations: WeakMap<PaperReference, PaperPresentationState>;
  empty: boolean;
  departingPaper: PaperReference | null;
  palette: (layout: PaletteLayout) => ReactNode;
  clearUnderlay: (
    offset: AreaOffset,
    frame: PresentedFrame,
    departingFrame: PresentedFrame | null,
    projection: PaperProjection,
    departingProjection: PaperProjection | null
  ) => ReactNode;
  clearOverlay: ReactNode;
  // The Notch Band's strip on the side the Clear Button docks to, which its tab overhangs.
  dockBand: ReactNode;
  actionsPanel: (area: AreaSize, viewport: AreaSize) => ReactNode;
  settings: ReactNode;
  status: ReactNode;
  capturePress: () => boolean;
  // Floats over the paper with the controls, clear of the bottom inset.
  overlays: ReactNode;
  // The paper, which runs under the bottom inset.
  children: (frame: PresentedFrame, space: AreaSize, projection: PaperProjection) => ReactNode;
};

function usePresentedPaper(
  { paper, empty, slot, origin, window, toolbarStyle, layoutOnly }: PaperPresentationInputs,
  departingPaper: PaperReference | null,
  memory: WeakMap<PaperReference, PaperPresentationState>
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
        layoutOnly,
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
      layoutOnly,
    ]
  );
  const [presentation, setPresentation] = useState(INITIAL_PAPER_PRESENTATION);
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
  const projection = useMemo(
    () => paperProjection(paper, next.extent ?? undefined),
    [paper, next.extent]
  );
  const departingProjection = departingPaper
    ? paperProjection(
        departingPaper,
        (departingPaper === paper ? next.extent : memory.get(departingPaper)?.extent) ?? undefined
      )
    : null;
  return { frame, departingFrame, projection, departingProjection };
}

function ClearOverlayLayer({ children }: { children: ReactNode }) {
  const { left, right } = useSafeAreaInsets();
  return (
    <View
      testID="rsd-clear-clip"
      pointerEvents="box-none"
      style={[docks.clearClip, { left: -left, right: -right }]}
    >
      <View
        testID="rsd-clear-overlay"
        pointerEvents="box-none"
        style={[docks.clearOverlay, { left, right }]}
      >
        {children}
      </View>
    </View>
  );
}

// The whole window, in the layout's coordinates, for the band strip the Clear Button docks against.
function DockBandLayer({ children }: { children: ReactNode }) {
  const { top, left, right } = useSafeAreaInsets();
  return (
    <View
      testID="rsd-dock-band"
      pointerEvents="none"
      style={[docks.window, { top: -top, left: -left, right: -right }]}
    >
      {children}
    </View>
  );
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
  paperPresentations,
  empty,
  departingPaper,
  palette,
  clearUnderlay,
  clearOverlay,
  dockBand,
  actionsPanel,
  settings,
  status,
  capturePress,
  overlays,
  children,
}: NativeDrawingLayoutProps) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const { contacts, handlers } = useSecondTouchLayout(capturePress);
  const window = useWindowDimensions();
  const axis = paletteAxis(window);
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
  const { area, host, onLayout, window: measuredWindow, layoutOnly } = useMeasuredPaperArea(window);
  const [root, setRoot] = useState<Box>();
  const [column, setColumn] = useState<Box>();
  const paperArea = area ?? window;
  const phoneLandscape = isPhoneLandscapeViewport(window);
  const { frame, departingFrame, projection, departingProjection } = usePresentedPaper(
    {
      paper,
      empty,
      slot: area ?? unmeasuredPaperSpace(paper, window, paperPresentations),
      origin: paperOrigin(root, column, area),
      window: measuredWindow,
      layoutOnly,
      toolbarStyle: bareGlass ? 'bare' : 'buttons',
    },
    departingPaper,
    paperPresentations
  );
  const paperNode = useMemo(
    () => children(frame, { width: paperArea.width, height: paperArea.height }, projection),
    [children, frame, paperArea.width, paperArea.height, projection]
  );
  const controlsLeftPx =
    bareGlass && axis === 'column' && !phoneLandscape ? PALETTE_FLOWS.column.extentPx : 0;
  const controlArea = insetControlsArea(paperArea, controlsLeftPx, insetBottom);
  const content = (
    <View
      testID="rsd-drawing-layout"
      onLayout={boxSetter(setRoot)}
      {...handlers}
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
          ref={host}
          style={drawingScreenStyles.canvasArea}
          onLayout={onLayout}
        >
          {paperNode}
          {bareGlass ? (
            <RsdGlassPanes space={glassPaperSpace(paperArea, insetBottom)} glass={bareGlass} />
          ) : null}
          {clearUnderlay(
            areaOffset(root, column, area),
            frame,
            departingFrame,
            projection,
            departingProjection
          )}
          <View
            testID="rsd-controls-inset"
            pointerEvents="box-none"
            style={[docks.controls, { bottom: insetBottom, left: controlsLeftPx }]}
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
      <DockBandLayer>{dockBand}</DockBandLayer>
      <ClearOverlayLayer>{clearOverlay}</ClearOverlayLayer>
    </View>
  );
  return <SecondTouchRouteScope value={contacts}>{content}</SecondTouchRouteScope>;
}
