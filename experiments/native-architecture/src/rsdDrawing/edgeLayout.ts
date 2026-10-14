import { isPhoneLandscape } from '../../../../web/src/lib/breakpoints';
import { CONTROL_GAP } from '../drawing/theme';
import { CORNER_BUTTON_SIZE_PX } from './RsdIconButton';

export type LayoutAxis = 'row' | 'column';
export type AreaSize = Readonly<{ width: number; height: number }>;
// How far an area's top and right edges sit inside the layout that holds it.
export type AreaOffset = Readonly<{ top: number; right: number }>;
export type EdgeOffset = Readonly<{ left: number; bottom: number }>;

// Every edge control is inset one gap from the paper area's edges: the shipping Actions Panel's
// PANEL_INSET, which Settings and the Fullscreen Toggle share.
export const EDGE_INSET_PX = CONTROL_GAP;

// The shipping actionButtonLayout.ts and app.css Actions Panel geometry. The candidate import
// boundary excludes shipping web source; rsd-native-actions-panel.test.mjs reads both and fails
// on divergence.
export const ACTION_BUTTON_GAP_PX = 12;
export const PHONE_TOOLBAR_GAP_PX = 10;
// The drawer's margin toward its chevron: with the chevron's own 8px icon padding it keeps the
// row's 12px rhythm. The phone-landscape L spaces it by its own gap instead.
export const DRAWER_TOGGLE_MARGIN_PX = 4;
export const TABLET_MIN_SIDE_PX = 600;
export const LARGE_TABLET_MIN_SIDE_PX = 1000;
export const ACTION_BUTTON_BASE_PX = {
  phone: { landscape: 54, portrait: 50 },
  tablet: { landscape: 60, portrait: 55 },
  largeTablet: { landscape: 68, portrait: 62 },
} as const;
// What the row or column spends before its buttons share the rest: the Settings Button's reserve
// plus the panel's inset, toggle margin and toggle in landscape; the clearance under the palette
// bar plus the same chrome in portrait.
export const LANDSCAPE_ROW_RESERVE_PX = 128;
export const PORTRAIT_COLUMN_RESERVE_PX = 72;
// The phone-landscape L: two four-slot legs of buttons capped at this size, the vertical leg
// beside the drawer's first button and the row running right from the corner.
export const PHONE_TOOLBAR_BUTTON_PX = 48;
export const PHONE_TOOLBAR_LEG_SLOTS = 4;
export const PHONE_TOOLBAR_VERTICAL_CHROME_PX = 94;
export const PHONE_TOOLBAR_HORIZONTAL_CHROME_PX = 160;
export const PHONE_TOOLBAR_PADDING_PX = 6;
// A flyout opens this far from its trigger: above it on a landscape row, beside it otherwise, and
// stacked upward on a portrait phone narrow enough for a row to run under Settings.
export const FLYOUT_OFFSET_PX = 8;
export const VERTICAL_FLYOUT_MAX_WIDTH_PX = 540;

const ICON_PADDING_SHARE = 6;

// 'row' and 'column' are the landscape and portrait panels; a landscape phone takes the L.
export type ActionPanelMode = LayoutAxis | 'phoneLandscape';
type SizeClass = keyof typeof ACTION_BUTTON_BASE_PX;
type Orientation = keyof (typeof ACTION_BUTTON_BASE_PX)[SizeClass];

// Shipping's PHONE_LANDSCAPE_QUERY: the palette bar gives way to the Color Button, and the Actions
// Panel takes its L.
export function isPhoneLandscapeViewport(viewport: AreaSize) {
  return isPhoneLandscape(viewport.width, viewport.height);
}

function actionPanelMode(viewport: AreaSize): ActionPanelMode {
  if (viewport.height >= viewport.width) return 'column';
  return isPhoneLandscapeViewport(viewport) ? 'phoneLandscape' : 'row';
}

function sizeClass(viewport: AreaSize): SizeClass {
  const shorter = Math.min(viewport.width, viewport.height);
  if (shorter >= LARGE_TABLET_MIN_SIDE_PX) return 'largeTablet';
  return shorter >= TABLET_MIN_SIDE_PX ? 'tablet' : 'phone';
}

// The size-class step the Button Size slider multiplies; a flyout option floors it at its own
// minimum (RsdIconButton's flyoutOptionSize).
function actionButtonBase(viewport: AreaSize) {
  const orientation: Orientation = viewport.height >= viewport.width ? 'portrait' : 'landscape';
  return ACTION_BUTTON_BASE_PX[sizeClass(viewport)][orientation];
}

// Where the drawer's tiles go. The first `leg` tiles (the Brush and Stroke Width buttons) climb
// the phone-landscape L's vertical leg; everywhere else every tile shares one line.
export type ActionPanelLayout = Readonly<{
  mode: ActionPanelMode;
  size: number;
  padding: number;
  base: number;
  tools: readonly EdgeOffset[];
  toggle: EdgeOffset;
  // The landscape phone's Color Button, which stands in for the palette bar there: centred on the
  // viewport's height while the drawer is closed, at the top of the L's leg while it is open.
  color: EdgeOffset | null;
}>;

function lineSize(mode: ActionPanelMode, area: AreaSize, base: number, scale: number, n: number) {
  if (mode === 'phoneLandscape')
    return Math.min(
      PHONE_TOOLBAR_BUTTON_PX * scale,
      (area.height - PHONE_TOOLBAR_VERTICAL_CHROME_PX) / PHONE_TOOLBAR_LEG_SLOTS,
      (area.width - PHONE_TOOLBAR_HORIZONTAL_CHROME_PX) / PHONE_TOOLBAR_LEG_SLOTS
    );
  const [extent, reserve] =
    mode === 'row'
      ? [area.width, LANDSCAPE_ROW_RESERVE_PX]
      : [area.height, PORTRAIT_COLUMN_RESERVE_PX];
  return Math.min(base * scale, (extent - reserve - (n - 1) * ACTION_BUTTON_GAP_PX) / n);
}

// The panel sits in the paper area's bottom-left corner. Its cross axis is as thick as its
// thickest control, and the chevron and tiles centre on it; the chevron follows the tiles along
// the main axis while the drawer is open and keeps the corner while it is closed.
export function actionPanelLayout({
  area,
  viewport,
  scale,
  count,
  leg,
  open,
  bottomInset = 0,
}: {
  area: AreaSize;
  viewport: AreaSize;
  scale: number;
  count: number;
  leg: number;
  open: boolean;
  // The window's bottom safe-area inset, which the area's bottom edge sits above: shipping centres
  // the closed drawer's Color Button on the whole viewport, insets included.
  bottomInset?: number;
}): ActionPanelLayout {
  const mode = actionPanelMode(viewport);
  const base = actionButtonBase(viewport);
  const size = Math.max(0, lineSize(mode, area, base, scale, Math.max(1, count)));
  const padding =
    mode === 'phoneLandscape' ? PHONE_TOOLBAR_PADDING_PX : (base / ICON_PADDING_SHARE) * scale;
  const thickness = Math.max(size, CORNER_BUTTON_SIZE_PX);
  const centred = (side: number) => EDGE_INSET_PX + (thickness - side) / 2;
  const toggleCross = centred(CORNER_BUTTON_SIZE_PX);
  if (mode === 'column') {
    const pitch = size + ACTION_BUTTON_GAP_PX;
    const run = count * pitch - ACTION_BUTTON_GAP_PX + DRAWER_TOGGLE_MARGIN_PX;
    return {
      mode,
      size,
      padding,
      base,
      tools: Array.from({ length: count }, (_, index) => ({
        left: centred(size),
        bottom: EDGE_INSET_PX + index * pitch,
      })),
      toggle: { left: toggleCross, bottom: EDGE_INSET_PX + (open && count > 0 ? run : 0) },
      color: null,
    };
  }
  const phone = mode === 'phoneLandscape';
  const gap = phone ? PHONE_TOOLBAR_GAP_PX : ACTION_BUTTON_GAP_PX;
  const margin = phone ? PHONE_TOOLBAR_GAP_PX : DRAWER_TOGGLE_MARGIN_PX;
  const pitch = size + gap;
  const climbing = phone ? Math.min(leg, count) : 0;
  const along = count - climbing;
  const rowBottom = centred(size);
  const tools = Array.from({ length: count }, (_, index) =>
    index < climbing
      ? { left: EDGE_INSET_PX, bottom: rowBottom + (climbing - index) * pitch }
      : { left: EDGE_INSET_PX + (index - climbing) * pitch, bottom: rowBottom }
  );
  const run = along > 0 ? along * pitch - gap + margin : 0;
  return {
    mode,
    size,
    padding,
    base,
    tools,
    toggle: { left: EDGE_INSET_PX + (open ? run : 0), bottom: toggleCross },
    color: phone
      ? {
          left: EDGE_INSET_PX,
          bottom:
            open && count > 0
              ? rowBottom + (climbing + 1) * pitch
              : (viewport.height - size) / 2 - bottomInset,
        }
      : null,
  };
}

// The chevron points where the drawer will move: out along its axis while closed, back toward the
// corner while open. The landscape phone's L opens up and to the right at once.
export const DRAWER_CHEVRON_TURN_DEG = {
  row: { closed: 0, open: 180 },
  column: { closed: -90, open: 90 },
  phoneLandscape: { closed: -45, open: 135 },
} as const satisfies Record<ActionPanelMode, { closed: number; open: number }>;

export type FlyoutPlacement = Readonly<EdgeOffset & { direction: LayoutAxis }>;

// A flyout pops above its trigger on a landscape row and beside it otherwise.
export function flyoutPlacement(
  mode: ActionPanelMode,
  trigger: EdgeOffset,
  size: number,
  viewport: AreaSize
): FlyoutPlacement {
  if (mode === 'row')
    return {
      left: trigger.left,
      bottom: trigger.bottom + size + FLYOUT_OFFSET_PX,
      direction: 'row',
    };
  const narrow = mode === 'column' && viewport.width <= VERTICAL_FLYOUT_MAX_WIDTH_PX;
  return {
    left: trigger.left + size + FLYOUT_OFFSET_PX,
    bottom: trigger.bottom,
    direction: narrow ? 'column' : 'row',
  };
}
