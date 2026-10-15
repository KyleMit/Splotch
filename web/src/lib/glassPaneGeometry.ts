import type { SafeAreaInsets } from './platform/safeArea';

// The bare toolbar's feathered glass, as pure geometry over a measured layout, so the shipping
// panes (glassPanes.ts) and the React Native port compute the same masks from their own state.
// It imports no geometry of its own: the port loads it in a chunk of its own, and a module that
// chunk shared with another lazy one would be hoisted onto the port's startup path.

export type OpenFlyout = 'brush' | 'stroke' | 'color' | null;

export const BARE_MENU_GAP_PX = 4;
export const VERTICAL_MENU_MAX_WIDTH_PX = 540;
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

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}
export interface Pane extends Rect {
  mask: string;
}
// One pane before its mask is drawn: the shapes it unites, the box that clips it, and the blur
// that feathers them.
export type PaneShape = Readonly<{ rects: readonly Rect[]; clip: Rect; sigma: number }>;

// The phone-landscape Color Menu's row: its swatch, gap and padding (both ends together), and the
// most swatches it holds.
type GlassColorMenu = Readonly<{
  swatchPx: number;
  gapPx: number;
  paddingPx: number;
  slots: number;
}>;

// Everything the panes read from a toolbar: the viewport and its insets, the rail the palette
// keeps, the Actions Panel's spacing and the controls it shows.
export type GlassPaneLayout = Readonly<{
  width: number;
  height: number;
  safe: Readonly<SafeAreaInsets>;
  orientation: 'portrait' | 'landscape';
  compact: boolean;
  railWidth: number;
  railHeight: number;
  panelInset: number;
  buttonGap: number;
  compactGap: number;
  toggleSize: number;
  count: number;
  size: number;
  optionSize: number;
  brushOptions: number;
  strokeOptions: number;
  stroke: boolean;
  fullscreen: boolean;
  colorMenu: GlassColorMenu;
}>;

// Abramowitz & Stegun 7.1.26: the blurred alpha a straight shape edge reaches
// `distance` inside itself is the normal CDF of distance / sigma.
export function normalCdf(z: number): number {
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
function featherTable(sigma: number): number[] {
  const solidAlpha = normalCdf(INFLATE_PX / sigma);
  return Array.from({ length: FEATHER_CURVE_SAMPLES + 1 }, (_, i) => {
    const ramp = Math.min(1, i / FEATHER_CURVE_SAMPLES / solidAlpha);
    return +(1 - (1 - ramp) ** 2).toFixed(3);
  });
}

// The mask's alpha for each blurred alpha, read through the feather table as feFuncA interpolates
// it, for a renderer that draws no SVG mask.
export function featherAlpha(sigma: number): (blurred: number) => number {
  const table = featherTable(sigma);
  return (blurred) => {
    const position = Math.min(1, Math.max(0, blurred)) * FEATHER_CURVE_SAMPLES;
    const index = Math.min(FEATHER_CURVE_SAMPLES - 1, Math.floor(position));
    return table[index] + (position - index) * (table[index + 1] - table[index]);
  };
}

function rectangle(left: number, top: number, right: number, bottom: number, radius = 0): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top, radius };
}

// The pane's own box: its shapes and their feather's reach, clipped. It is also the mask's filter
// region, so the blur sees nothing of a shape past it.
export function paneBox({ rects, clip, sigma }: PaneShape): Rect {
  const reach = FEATHER_REACH_SIGMAS * sigma;
  const x = Math.max(clip.x, Math.min(...rects.map((r) => r.x)) - reach);
  const y = Math.max(clip.y, Math.min(...rects.map((r) => r.y)) - reach);
  const right = Math.min(clip.x + clip.width, Math.max(...rects.map((r) => r.x + r.width)) + reach);
  const bottom = Math.min(
    clip.y + clip.height,
    Math.max(...rects.map((r) => r.y + r.height)) + reach
  );
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function glassPane(shape: PaneShape): Pane {
  const { rects, sigma } = shape;
  const { x, y, width, height } = paneBox(shape);
  const shapes = rects
    .map(
      (r) =>
        `<rect x="${r.x - x}" y="${r.y - y}" width="${r.width}" height="${r.height}" rx="${r.radius ?? 0}"/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><feGaussianBlur stdDeviation="${sigma}"/><feComponentTransfer><feFuncA type="table" tableValues="${featherTable(sigma).join(' ')}"/></feComponentTransfer></filter><g filter="url(#f)" fill="black">${shapes}</g></svg>`;
  return { x, y, width, height, mask: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` };
}

function flyoutRectangle(
  layout: GlassPaneLayout,
  open: Exclude<OpenFlyout, null>,
  trigger: Rect
): Rect {
  const { width, safe, orientation, compact, size, optionSize: option, panelInset } = layout;
  const portrait = orientation === 'portrait';
  const count = open === 'brush' ? layout.brushOptions : layout.strokeOptions;
  const vertical = portrait && width <= VERTICAL_MENU_MAX_WIDTH_PX;
  let menuWidth = vertical ? option : count * option + (count - 1) * BARE_MENU_GAP_PX;
  let menuHeight = vertical ? count * option + (count - 1) * BARE_MENU_GAP_PX : option;
  if (open === 'color') {
    const room = width - safe.left - safe.right - size - 3 * panelInset;
    const { swatchPx, gapPx, paddingPx } = layout.colorMenu;
    const slots = Math.min(
      layout.colorMenu.slots,
      Math.max(1, Math.floor((room - paddingPx + gapPx) / (swatchPx + gapPx)))
    );
    menuWidth = slots * swatchPx + (slots - 1) * gapPx;
    menuHeight = swatchPx;
  }
  const beside = compact || portrait;
  const left = beside ? trigger.x + trigger.width + panelInset : trigger.x;
  const bottom = beside ? trigger.y + trigger.height : trigger.y - panelInset;
  return rectangle(
    left - MENU_PADDING_PX,
    bottom - menuHeight - MENU_PADDING_PX,
    left + menuWidth + MENU_PADDING_PX,
    bottom + MENU_PADDING_PX,
    MENU_RADIUS_PX
  );
}

function gearCornerGlass(width: number, height: number, safe: Readonly<SafeAreaInsets>): Rect {
  return rectangle(
    width - safe.right - CORNER_DEPTH_PX,
    height - safe.bottom - CORNER_DEPTH_PX,
    width + BLEED_PX,
    height + BLEED_PX,
    MENU_RADIUS_PX
  );
}

function fullscreenCornerGlass(safe: Readonly<SafeAreaInsets>): Rect {
  return rectangle(
    safe.left - BLEED_PX,
    safe.top - BLEED_PX,
    safe.left + FULLSCREEN_DEPTH_PX,
    safe.top + FULLSCREEN_DEPTH_PX,
    FULLSCREEN_RADIUS_PX
  );
}

export function glassPaneShapes(
  layout: GlassPaneLayout,
  open: OpenFlyout,
  expanded: boolean
): PaneShape[] {
  const { width, height, safe, compact, orientation, count, size, panelInset } = layout;
  const { railWidth, railHeight, buttonGap, toggleSize: toggle } = layout;
  if (!width || !height) return [];
  const portrait = orientation === 'portrait';
  const hasActions = count > 0;
  const drawerOpen = expanded && hasActions;
  const pitch = size + (compact ? layout.compactGap : buttonGap);
  const railX = compact || portrait ? 0 : safe.left + railWidth;
  const railY = portrait ? safe.top + railHeight : 0;
  const clip = rectangle(railX, railY, width, height);
  const x = safe.left + panelInset + (compact || portrait ? 0 : railWidth);
  const bottom = height - safe.bottom - panelInset;
  const depth = drawerOpen ? size + 2 * panelInset : toggle + 2 * panelInset;
  const drawerExtent = drawerOpen ? count * pitch - buttonGap + panelInset : 0;
  const rowEnd = x + drawerExtent + toggle;
  const columnTop = bottom - drawerExtent - toggle;
  const brush = layout.brushOptions > 1;
  const { stroke } = layout;
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
            x + size + panelInset + INFLATE_PX,
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
          x + rowCount * pitch + toggle + INFLATE_PX,
          height + BLEED_PX
        )
      );
    } else if (hasActions)
      strip.push(
        rectangle(
          -BLEED_PX,
          bottom - toggle - INFLATE_PX,
          x + toggle + INFLATE_PX,
          height + BLEED_PX
        )
      );
  } else if (hasActions) {
    strip.push(
      portrait
        ? rectangle(
            -BLEED_PX,
            columnTop - INFLATE_PX,
            safe.left + depth + panelInset + INFLATE_PX,
            height + BLEED_PX
          )
        : rectangle(
            railX - BLEED_PX,
            height - safe.bottom - depth - INFLATE_PX,
            rowEnd + panelInset + INFLATE_PX,
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
      flyoutRectangle(layout, open, rectangle(triggerX, triggerY, triggerX + size, triggerY + size))
    );
  }
  const gear = gearCornerGlass(width, height, safe);
  if (compact) {
    strip.push(gear);
    if (layout.fullscreen) strip.push(fullscreenCornerGlass(safe));
  }
  const sigma = compact ? COMPACT_FEATHER_SIGMA_PX : FEATHER_SIGMA_PX;
  const shapes: PaneShape[] = strip.length ? [{ rects: strip, clip, sigma }] : [];
  if (!compact) shapes.push({ rects: [gear], clip, sigma });
  return shapes;
}

export function glassPanes(layout: GlassPaneLayout, open: OpenFlyout, expanded: boolean): Pane[] {
  return glassPaneShapes(layout, open, expanded).map(glassPane);
}
