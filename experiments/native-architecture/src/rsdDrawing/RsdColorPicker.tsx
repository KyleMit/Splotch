import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type PointerEvent } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { css, html } from 'react-strict-dom';
import { Svg, Polygon } from '../platform/svg';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import type { CustomColor } from '../drawing/palette';
import { HEX_GRID_GEOMETRY } from '../../../../web/src/lib/design/trimGeometry';
import { mixSrgb } from './colorMix';
import {
  HEX_DIM,
  HEX_DIM_KEYLINE,
  HEX_HOVER_BRIGHTNESS,
  HEX_HOVER_SCALE,
  HEX_KEYLINE_INSET_PX,
  HEX_SELECTED_INSET_PX,
  HEX_SELECTED_SHADE_PERCENT,
  HEX_WHITE,
  brighten,
  hexagonAt,
  isDiscreteActivation,
  hexagonPoints,
  hexPickerLayout,
  snapHexagon,
  type HexCell,
  type HexLayout,
} from './hexPicker';
import { MODAL_GUTTER_MIN_PX } from './modalGeometry';
import { ModalStage } from './ModalShell';
import { RsdPressable } from './RsdPressable';
import { colors, darkTheme, dimensions, shadows } from './tokens.css';

type Point = { x: number; y: number };
// The layout a drag's origin and hit-tests were taken against; a new one ends the drag.
type Drag = { touch: string; layout: HexLayout; origin: Point; highlighted: CustomColor | null };

function touchPage(event: GestureResponderEvent, touch: string): Point | null {
  const { nativeEvent } = event;
  for (const point of [...(nativeEvent.changedTouches ?? []), ...(nativeEvent.touches ?? [])])
    if (String(point.identifier) === touch) return { x: point.pageX, y: point.pageY };
  return String(nativeEvent.identifier) === touch
    ? { x: nativeEvent.pageX, y: nativeEvent.pageY }
    : null;
}

function contacts(event: GestureResponderEvent) {
  return event.nativeEvent.touches?.length ?? 0;
}

// The grid's box in client coordinates: a DOM element on the web, and a React Native element on
// Android and iOS, both answer getBoundingClientRect. Hover measures from the grid itself rather
// than a pointer's offset, which is relative to whichever element the pointer is over.
function boundingBox(target: unknown): Point | null {
  if (typeof target !== 'object' || target === null || !('getBoundingClientRect' in target))
    return null;
  const measure = target.getBoundingClientRect;
  if (typeof measure !== 'function') return null;
  const rect: unknown = measure.call(target);
  if (typeof rect !== 'object' || rect === null || !('x' in rect) || !('y' in rect)) return null;
  return typeof rect.x === 'number' && typeof rect.y === 'number' ? { x: rect.x, y: rect.y } : null;
}

// ColorPicker.svelte's hexSnapGesture: a press on or between hexagons highlights the nearest,
// dragging moves the highlight, and lifting picks what is under the finger, or the swatch still
// highlighted when the finger lifts beyond every hexagon. The responder keeps the drag once it
// leaves the grid, as shipping's pointer capture does. One finger explores: a second contact, a
// lost tracked contact or a new layout (shipping re-measures its centers on resize) cancels the
// drag without a pick.
function useHexSnap(layout: HexLayout, pick: (color: CustomColor) => void) {
  const [hovered, setHovered] = useState<CustomColor | null>(null);
  const drag = useRef<Drag | null>(null);
  const reset = () => {
    drag.current = null;
    setHovered(null);
  };
  useEffect(() => {
    if (drag.current && drag.current.layout !== layout) reset();
  }, [layout]);
  // The tracked contact's grid point, or null once the drag is cancelled.
  const tracked = (event: GestureResponderEvent): Point | null => {
    const current = drag.current;
    const page = current ? touchPage(event, current.touch) : null;
    if (!current || !page || current.layout !== layout || contacts(event) > 1) {
      if (current) reset();
      return null;
    }
    return { x: page.x - current.origin.x, y: page.y - current.origin.y };
  };
  const handlers = {
    onStartShouldSetResponder: (event: GestureResponderEvent) =>
      contacts(event) <= 1 &&
      snapHexagon(layout, event.nativeEvent.locationX, event.nativeEvent.locationY) !== null,
    onResponderGrant: ({ nativeEvent }: GestureResponderEvent) => {
      const color = snapHexagon(layout, nativeEvent.locationX, nativeEvent.locationY);
      drag.current = {
        touch: String(nativeEvent.identifier),
        layout,
        origin: {
          x: nativeEvent.pageX - nativeEvent.locationX,
          y: nativeEvent.pageY - nativeEvent.locationY,
        },
        highlighted: color,
      };
      setHovered(color);
      return true;
    },
    onResponderStart: (event: GestureResponderEvent) => {
      if (drag.current && contacts(event) > 1) reset();
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const point = tracked(event);
      const current = drag.current;
      if (!point || !current) return;
      current.highlighted = snapHexagon(layout, point.x, point.y);
      setHovered(current.highlighted);
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const point = tracked(event);
      const current = drag.current;
      if (!point || !current) return;
      const color = snapHexagon(layout, point.x, point.y) ?? current.highlighted;
      reset();
      if (color) pick(color);
    },
    onResponderTerminate: reset,
    onResponderTerminationRequest: () => false,
    // The web's mouse hover, which touch never shows: shipping guards :hover behind a real
    // pointer so a tapped swatch is not left enlarged.
    onPointerMove: ({ nativeEvent, currentTarget }: PointerEvent) => {
      const box = boundingBox(currentTarget);
      if (drag.current || nativeEvent.pointerType !== 'mouse' || !box) return;
      setHovered(hexagonAt(layout, nativeEvent.clientX - box.x, nativeEvent.clientY - box.y));
    },
    onPointerLeave: () => {
      if (!drag.current) setHovered(null);
    },
  };
  return { hovered, handlers, reset };
}

type RsdColorPickerProps = {
  visible: boolean;
  // The custom paint chosen last, which shipping rings while a palette paint is loaded too.
  customColor: CustomColor | undefined;
  onChoose: (color: CustomColor) => void;
  onClose: () => void;
  onDismiss?: () => void;
};

// The shipping Color Picker: a wordless honeycomb of fixed hexagons in a white card. Sliding
// explores, lifting picks, and the picker closes on the pick; the scrim, Escape and Back close it
// without one. Each hexagon is a button named by its color for keyboards and screen readers;
// touch and mouse reach the grid beneath them.
export function RsdColorPicker({
  visible,
  customColor,
  onChoose,
  onClose,
  onDismiss,
}: RsdColorPickerProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useDrawingAppearance();
  const ink = useDrawingTheme().iconInk;
  const { width: windowWidth, height: windowHeight } = window;
  // One layout per viewport, so a drag can tell a resize from an ordinary render.
  const layout = useMemo(
    () => hexPickerLayout({ width: windowWidth, height: windowHeight }),
    [windowWidth, windowHeight]
  );
  const latest = useRef(onChoose);
  latest.current = onChoose;
  const snap = useHexSnap(layout, (color) => latest.current(color));
  const choose = useCallback((color: CustomColor) => latest.current(color), []);
  const gutter = Math.max(MODAL_GUTTER_MIN_PX, insets.left, insets.right);
  const width = Math.min(layout.width, window.width - 2 * gutter);
  const height = Math.min(layout.height, window.height * HEX_GRID_GEOMETRY.viewportHeightFraction);
  const gridSize = { ...HOST_POINTER, width: layout.width, height: layout.height };
  const close = () => {
    snap.reset();
    onClose();
  };
  return (
    <ModalStage visible={visible} label="Color Picker" onClose={close} onDismiss={onDismiss}>
      <html.div
        data-testid="color-picker-card"
        inert={!visible}
        style={[theme === 'dark' && darkTheme, styles.card(width, height)]}
      >
        <View testID="color-picker-grid" style={[grid.host, gridSize]} {...snap.handlers}>
          {layout.cells.map((cell) => (
            <Hexagon
              key={cell.color}
              cell={cell}
              width={layout.hexWidth}
              height={layout.hexHeight}
              ink={ink}
              hovered={snap.hovered === cell.color}
              selected={customColor === cell.color}
              onChoose={choose}
            />
          ))}
        </View>
      </html.div>
    </ModalStage>
  );
}

function ring(cell: HexCell, ink: string, hovered: boolean, selected: boolean) {
  if (selected)
    return {
      fill: mixSrgb(cell.color, 100 - HEX_SELECTED_SHADE_PERCENT, '#000000'),
      inset: HEX_SELECTED_INSET_PX,
    };
  if (cell.color === HEX_DIM) return { fill: HEX_DIM_KEYLINE, inset: HEX_KEYLINE_INSET_PX };
  if (cell.color === HEX_WHITE) return { fill: ink, inset: HEX_KEYLINE_INSET_PX };
  return hovered ? { fill: ink, inset: 0 } : null;
}

// A ringed swatch keeps its ring width while hovered; only a plain swatch shrinks into the ink.
const Hexagon = memo(function Hexagon({
  cell,
  width,
  height,
  ink,
  hovered,
  selected,
  onChoose,
}: {
  cell: HexCell;
  width: number;
  height: number;
  ink: string;
  hovered: boolean;
  selected: boolean;
  onChoose: (color: CustomColor) => void;
}) {
  const back = ring(cell, ink, hovered, selected);
  const shrink = hovered && back?.inset === 0 ? HEX_HOVER_SCALE : 1;
  return (
    <RsdPressable
      aria-label={cell.color}
      style={styles.hexagon(cell.x, cell.y, width, height)}
      onClick={(event) => {
        if (isDiscreteActivation(event)) onChoose(cell.color);
      }}
    >
      <Svg width={width} height={height} pointerEvents="none">
        {back ? <Polygon points={hexagonPoints(width, height, 0, 1)} fill={back.fill} /> : null}
        <Polygon
          points={hexagonPoints(width, height, back?.inset ?? 0, shrink)}
          fill={hovered ? brighten(cell.color, HEX_HOVER_BRIGHTNESS) : cell.color}
        />
      </Svg>
    </RsdPressable>
  );
});

// touchAction reaches react-native-web's CSS so a drag across the honeycomb never pans the page;
// React Native ignores it, where the responder already owns the drag.
const HOST_POINTER = { touchAction: 'none' } as const;

const grid = StyleSheet.create({ host: { position: 'absolute', left: 0, top: 0 } });

const styles = css.create({
  card: (width: number, height: number) => ({
    position: 'relative',
    width,
    height,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: shadows.shadowPop,
  }),
  // Pointer events skip the buttons so every press reaches the grid's snap; a keyboard or
  // screen reader still activates a hexagon directly, and isDiscreteActivation drops a pointer's
  // click should one reach it, as shipping's handleHexClick does.
  hexagon: (left: number, top: number, width: number, height: number) => ({
    position: 'absolute',
    left,
    top,
    width,
    height,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  }),
});
