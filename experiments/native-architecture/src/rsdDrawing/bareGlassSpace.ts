import type { GlassPaneLayout } from '../../../../web/src/lib/glassPaneGeometry';
import { STROKE_WIDTHS } from '../drawing/strokeWidth';
import type { PanelGlass } from './bareGlassLayout';
import { ACTION_BUTTON_GAP_PX, EDGE_INSET_PX, PHONE_TOOLBAR_GAP_PX } from './edgeLayout';
import { PALETTE_FLOWS } from './paletteGeometry';
import { PALETTE_COLORS } from '../drawing/palette';
import { CORNER_BUTTON_SIZE_PX } from './RsdIconButton';

// The Color Menu takes the portrait palette row's swatch, gap and padding, and every color but the
// first ones the trim order drops. Restated rather than imported from colorMenuLayout.ts: that
// module rides in the menus' chunk, and one the glass chunk shared with it would be hoisted onto the
// web startup path. rsd-native-bare-toolbar.test.mjs holds the menu here to colorMenuLayout.ts.
const COLOR_MENU_DROPPED_COLORS = 4;
const CUSTOM_SLOTS = 1;
const ROW = PALETTE_FLOWS.row;

// The flat layout's paper area: the whole layout, from the frame's top-left corner to the bottom of
// the screen, whose bottom inset the controls sit clear of.
export type GlassSpace = Readonly<{ width: number; height: number; insetBottom: number }>;

// Shipping's glass geometry in the paper area's coordinates. The frame has already taken the top
// and side insets, so only the bottom one remains.
export function glassPaneLayout(
  space: GlassSpace,
  panel: PanelGlass,
  fullscreen: boolean
): GlassPaneLayout {
  return {
    width: space.width,
    height: space.height,
    safe: { top: 0, right: 0, bottom: space.insetBottom, left: 0 },
    orientation: panel.mode === 'column' ? 'portrait' : 'landscape',
    compact: panel.mode === 'phoneLandscape',
    railWidth: PALETTE_FLOWS.column.extentPx,
    railHeight: PALETTE_FLOWS.row.extentPx,
    panelInset: EDGE_INSET_PX,
    buttonGap: ACTION_BUTTON_GAP_PX,
    compactGap: PHONE_TOOLBAR_GAP_PX,
    toggleSize: CORNER_BUTTON_SIZE_PX,
    count: panel.count,
    size: panel.size,
    optionSize: panel.optionSize,
    brushOptions: panel.brushOptions,
    strokeOptions: STROKE_WIDTHS.length,
    stroke: panel.stroke,
    fullscreen,
    colorMenu: {
      swatchPx: ROW.swatchPx,
      gapPx: ROW.gapPx,
      paddingPx: 2 * ROW.endPaddingPx,
      slots: PALETTE_COLORS.length - COLOR_MENU_DROPPED_COLORS + CUSTOM_SLOTS,
    },
  };
}
