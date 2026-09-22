import {
  ACTION_BUTTON_GAP,
  DRAWER_TOGGLE_SIZE,
  PHONE_TOOLBAR_GAP_PX,
  PANEL_INSET,
  visibleActionButtonCount,
  renderedActionButtonSize,
  renderedFlyoutOptionSize,
} from './actionButtonLayout';
import { layoutState } from './state/layout.svelte';
import { actionControlShown, enabledOptionalBrushes } from './state/settings.svelte';
import { STROKE_SIZES } from './state/strokeWidth.svelte';
import { COLOR_MENU_GEOMETRY } from './design/trimGeometry';
import { LANDSCAPE_COLORS } from './landscapeToolbar';
import { fullscreenState } from './state/fullscreen.svelte';

export type OpenFlyout = 'brush' | 'stroke' | 'color' | null;
import {
  BARE_RAIL_WIDTH_PX,
  BARE_RAIL_HEIGHT_PX,
  BARE_MENU_GAP_PX,
  VERTICAL_MENU_MAX_WIDTH_PX,
} from './bareToolbar';
const FEATHER_SIGMA_PX = 24;
// Phone landscape unites controls that sit only a few button-widths apart
// (fullscreen, color, drawer toggle) into one pane; a wider feather would sum
// their tails into a frosted strip down the left edge.
const COMPACT_FEATHER_SIGMA_PX = 12;
// Three sigma, where the blurred mask is effectively transparent, so the
// pane's own box never shows as an edge.
const FEATHER_REACH_SIGMAS = 3;
const FEATHER_CURVE_SAMPLES = 16;
const INFLATE_PX = 14;
const BLEED_PX = 44;
const MENU_PADDING_PX = 24;
const MENU_RADIUS_PX = 20;
const CORNER_DEPTH_PX = 78;
const FULLSCREEN_DEPTH_PX = 70;
const FULLSCREEN_RADIUS_PX = 18;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}
interface Pane extends Rect {
  mask: string;
}

// Abramowitz & Stegun 7.1.26: the blurred alpha a straight shape edge reaches
// `distance` inside itself is the normal CDF of distance / sigma.
function normalCdf(z: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413061 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Remaps the blur's alpha so the glass is solid up to the controls (the
// INFLATE_PX margin inside each shape) and eases out from there; the quadratic
// ease-out meets the solid region with zero slope so no crease marks the seam.
function featherCurve(sigma: number): string {
  const solidAlpha = normalCdf(INFLATE_PX / sigma);
  return Array.from({ length: FEATHER_CURVE_SAMPLES + 1 }, (_, i) => {
    const ramp = Math.min(1, i / FEATHER_CURVE_SAMPLES / solidAlpha);
    return +(1 - (1 - ramp) ** 2).toFixed(3);
  }).join(' ');
}

function rectangle(left: number, top: number, right: number, bottom: number, radius = 0): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top, radius };
}

function glassPane(rects: Rect[], clip: Rect, sigma: number): Pane {
  const reach = FEATHER_REACH_SIGMAS * sigma;
  const x = Math.max(clip.x, Math.min(...rects.map((r) => r.x)) - reach);
  const y = Math.max(clip.y, Math.min(...rects.map((r) => r.y)) - reach);
  const right = Math.min(clip.x + clip.width, Math.max(...rects.map((r) => r.x + r.width)) + reach);
  const bottom = Math.min(
    clip.y + clip.height,
    Math.max(...rects.map((r) => r.y + r.height)) + reach
  );
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  const shapes = rects
    .map(
      (r) =>
        `<rect x="${r.x - x}" y="${r.y - y}" width="${r.width}" height="${r.height}" rx="${r.radius ?? 0}"/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><feGaussianBlur stdDeviation="${sigma}"/><feComponentTransfer><feFuncA type="table" tableValues="${featherCurve(sigma)}"/></feComponentTransfer></filter><g filter="url(#f)" fill="black">${shapes}</g></svg>`;
  return { x, y, width, height, mask: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` };
}

function flyoutRectangle(
  open: Exclude<OpenFlyout, null>,
  trigger: Rect,
  size: number,
  portrait: boolean,
  compact: boolean
): Rect {
  const { viewportWidth: width, safeArea: safe, orientation } = layoutState;
  const option = renderedFlyoutOptionSize();
  const count = open === 'brush' ? enabledOptionalBrushes().length + 1 : STROKE_SIZES.length;
  const vertical = portrait && width <= VERTICAL_MENU_MAX_WIDTH_PX;
  let menuWidth = vertical ? option : count * option + (count - 1) * BARE_MENU_GAP_PX;
  let menuHeight = vertical ? count * option + (count - 1) * BARE_MENU_GAP_PX : option;
  if (open === 'color') {
    const room = width - safe.left - safe.right - size - 3 * PANEL_INSET;
    const { swatchPx, gapPx, paddingPx } = COLOR_MENU_GEOMETRY;
    const slots = Math.min(
      LANDSCAPE_COLORS.length + 1,
      Math.max(1, Math.floor((room - paddingPx + gapPx) / (swatchPx + gapPx)))
    );
    menuWidth = slots * swatchPx + (slots - 1) * gapPx;
    menuHeight = swatchPx;
  }
  const beside = compact || orientation === 'portrait';
  const left = beside ? trigger.x + trigger.width + PANEL_INSET : trigger.x;
  const bottom = beside ? trigger.y + trigger.height : trigger.y - PANEL_INSET;
  return rectangle(
    left - MENU_PADDING_PX,
    bottom - menuHeight - MENU_PADDING_PX,
    left + menuWidth + MENU_PADDING_PX,
    bottom + MENU_PADDING_PX,
    MENU_RADIUS_PX
  );
}

export function toolbarGlassPanes(open: OpenFlyout, expanded: boolean): Pane[] {
  const {
    viewportWidth: width,
    viewportHeight: height,
    safeArea: safe,
    phoneLandscape: compact,
    orientation,
  } = layoutState;
  if (!width || !height) return [];
  const portrait = orientation === 'portrait';
  const count = visibleActionButtonCount();
  const hasActions = count > 0;
  const drawerOpen = expanded && hasActions;
  const size = renderedActionButtonSize();
  const pitch = size + (compact ? PHONE_TOOLBAR_GAP_PX : ACTION_BUTTON_GAP);
  const railX = compact || portrait ? 0 : safe.left + BARE_RAIL_WIDTH_PX;
  const railY = portrait ? safe.top + BARE_RAIL_HEIGHT_PX : 0;
  const clip = rectangle(railX, railY, width, height);
  const x = safe.left + PANEL_INSET + (compact || portrait ? 0 : BARE_RAIL_WIDTH_PX);
  const bottom = height - safe.bottom - PANEL_INSET;
  const depth = drawerOpen ? size + 2 * PANEL_INSET : DRAWER_TOGGLE_SIZE + 2 * PANEL_INSET;
  const rowEnd =
    x + (drawerOpen ? count * pitch - ACTION_BUTTON_GAP + PANEL_INSET : 0) + DRAWER_TOGGLE_SIZE;
  const columnTop =
    bottom -
    (drawerOpen ? count * pitch - ACTION_BUTTON_GAP + PANEL_INSET : 0) -
    DRAWER_TOGGLE_SIZE;
  const brush = enabledOptionalBrushes().length > 0;
  const stroke = actionControlShown('strokeWidthControlEnabled');
  const colorTop = drawerOpen
    ? bottom - (1 + Number(brush) + Number(stroke)) * pitch - size
    : (height - size) / 2;
  const strip: Rect[] = [];
  if (compact) {
    strip.push(
      drawerOpen
        ? rectangle(
            -BLEED_PX,
            colorTop - INFLATE_PX,
            x + size + PANEL_INSET + INFLATE_PX,
            height + BLEED_PX
          )
        : rectangle(
            x - INFLATE_PX,
            colorTop - INFLATE_PX,
            x + size + INFLATE_PX,
            colorTop + size + INFLATE_PX
          )
    );
    if (drawerOpen) {
      const rowCount = count - Number(brush) - Number(stroke);
      strip.push(
        rectangle(
          -BLEED_PX,
          height - safe.bottom - depth - INFLATE_PX,
          x + rowCount * pitch + DRAWER_TOGGLE_SIZE + INFLATE_PX,
          height + BLEED_PX
        )
      );
    } else if (hasActions)
      strip.push(
        rectangle(
          -BLEED_PX,
          bottom - DRAWER_TOGGLE_SIZE - INFLATE_PX,
          x + DRAWER_TOGGLE_SIZE + INFLATE_PX,
          height + BLEED_PX
        )
      );
  } else if (hasActions) {
    strip.push(
      portrait
        ? rectangle(
            -BLEED_PX,
            columnTop - INFLATE_PX,
            safe.left + depth + PANEL_INSET + INFLATE_PX,
            height + BLEED_PX
          )
        : rectangle(
            railX - BLEED_PX,
            height - safe.bottom - depth - INFLATE_PX,
            rowEnd + PANEL_INSET + INFLATE_PX,
            height + BLEED_PX
          )
    );
  }
  if (open) {
    const index = open === 'stroke' ? Number(brush) : 0;
    const triggerY = compact
      ? open === 'color'
        ? colorTop
        : bottom - (open === 'brush' ? 1 + Number(stroke) : 1) * pitch - size
      : portrait
        ? bottom - size - index * pitch
        : bottom - size;
    const triggerX = !compact && !portrait ? x + index * pitch : x;
    strip.push(
      flyoutRectangle(
        open,
        rectangle(triggerX, triggerY, triggerX + size, triggerY + size),
        size,
        portrait,
        compact
      )
    );
  }
  const gear = rectangle(
    width - safe.right - CORNER_DEPTH_PX,
    height - safe.bottom - CORNER_DEPTH_PX,
    width + BLEED_PX,
    height + BLEED_PX,
    MENU_RADIUS_PX
  );
  if (compact) {
    strip.push(gear);
    if (fullscreenState.supported)
      strip.push(
        rectangle(
          safe.left - BLEED_PX,
          safe.top - BLEED_PX,
          safe.left + FULLSCREEN_DEPTH_PX,
          safe.top + FULLSCREEN_DEPTH_PX,
          FULLSCREEN_RADIUS_PX
        )
      );
  }
  const sigma = compact ? COMPACT_FEATHER_SIGMA_PX : FEATHER_SIGMA_PX;
  const panes = strip.length ? [glassPane(strip, clip, sigma)] : [];
  if (!compact) panes.push(glassPane([gear], clip, sigma));
  return panes;
}
