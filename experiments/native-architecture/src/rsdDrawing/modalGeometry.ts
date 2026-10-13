import {
  LARGE_TABLET_MIN_SIDE_PX,
  SETTINGS_WIDE_MIN_WIDTH_PX,
  TABLET_MIN_SIDE_PX,
  isPhoneLandscape,
} from '../../../../web/src/lib/breakpoints';

// The shipping modal frame: app.css .modal-dialog / .modal-shell / .modal-close-btn /
// .dialog-header-control, DialogHeader.svelte, and each card's own width rules in
// SettingsModal.svelte, ParentalGate.svelte and app.css .confirm-card.
// modal-geometry.test.mjs reads those sources and fails when a value here drifts.

export const MODAL_SCRIM_FROSTED = 'rgba(0, 0, 0, 0.6)';
export const MODAL_SCRIM_BLUR_PX = 4;
// The shipping no-blur backdrop (prefers-reduced-transparency): a slightly deeper dim stands in
// for the frosting wherever the scrim cannot blur.
export const MODAL_SCRIM_PLAIN = 'rgba(0, 0, 0, 0.7)';

export const MODAL_GUTTER_MIN_PX = 16;
export const MODAL_CONTROL_SIZE_PX = 48;
export const MODAL_CLOSE_INSET_PX = 12;
export const MODAL_CLOSE_BORDER_PX = 2;
export const MODAL_CLOSE_PADDING_PX = 10;
export const DIALOG_BACK_PADDING_PX = 12;
export const MODAL_CONTROL_ICON_PX = MODAL_CONTROL_SIZE_PX - 2 * DIALOG_BACK_PADDING_PX;
export const MODAL_CONTROL_PRESSED_SCALE = 0.92;

const CARD_HEIGHT_CAP_FRACTION = 0.85;
const WIDE_CARD_HEIGHT_CEILING_PX = 760;
const SETTINGS_MAX_WIDTH_PX = 500;
const SETTINGS_WIDE_MAX_WIDTH_PX = 860;
const SETTINGS_COMPACT_MAX_WIDTH_PX = 640;
// SettingsModal.svelte's narrow-phone step for its header and scroll padding.
const SETTINGS_NARROW_MAX_WIDTH_PX = 480;
const CONFIRM_MAX_WIDTH_PX = 336;
const GATE_MAX_WIDTH_PX = {
  phone: 336,
  phoneLandscape: 560,
  tablet: 420,
  largeTablet: 480,
} as const;

type Box = { top: number; inline: number; bottom: number };

const SETTINGS_HEADER: Record<'narrow' | 'roomy', Box> = {
  narrow: { top: 24, inline: 20, bottom: 16 },
  roomy: { top: 28, inline: 24, bottom: 18 },
};
const SETTINGS_SCROLL: Record<'narrow' | 'roomy', Box> = {
  narrow: { top: 0, inline: 20, bottom: 24 },
  roomy: { top: 0, inline: 24, bottom: 28 },
};
const CONFIRM_CONTENT: Box = { top: 24, inline: 24, bottom: 20 };
const GATE_CONTENT: Record<keyof typeof GATE_MAX_WIDTH_PX, Box> = {
  phone: { top: 24, inline: 24, bottom: 20 },
  phoneLandscape: { top: 16, inline: 22, bottom: 16 },
  tablet: { top: 24, inline: 32, bottom: 24 },
  largeTablet: { top: 32, inline: 40, bottom: 32 },
};

// Settings is the shipping Settings card; a sheet is that card's phone shell, which every RN
// sheet without a shipping card of its own wears; the gate and confirm cards are the narrow
// boundary cards.
export type ModalSize = 'settings' | 'sheet' | 'gate' | 'confirm';

export type ModalFrame = {
  width: number;
  maxHeight: number;
  height: number | null;
  header: Box;
  body: Box;
};

type Window = { width: number; height: number };

function gateClass({ width, height }: Window): keyof typeof GATE_MAX_WIDTH_PX {
  if (isPhoneLandscape(width, height)) return 'phoneLandscape';
  if (width >= LARGE_TABLET_MIN_SIDE_PX && height >= LARGE_TABLET_MIN_SIDE_PX) return 'largeTablet';
  if (width >= TABLET_MIN_SIDE_PX && height >= TABLET_MIN_SIDE_PX) return 'tablet';
  return 'phone';
}

function settingsMaxWidth(window: Window, size: 'settings' | 'sheet') {
  if (size === 'sheet') return SETTINGS_MAX_WIDTH_PX;
  if (isPhoneLandscape(window.width, window.height)) return SETTINGS_COMPACT_MAX_WIDTH_PX;
  return window.width >= SETTINGS_WIDE_MIN_WIDTH_PX
    ? SETTINGS_WIDE_MAX_WIDTH_PX
    : SETTINGS_MAX_WIDTH_PX;
}

function settingsWide(window: Window, size: ModalSize) {
  return (
    size === 'settings' &&
    window.width >= SETTINGS_WIDE_MIN_WIDTH_PX &&
    !isPhoneLandscape(window.width, window.height)
  );
}

function fitWidth(window: Window, gutter: number, maxWidth: number) {
  return Math.min(maxWidth, window.width - 2 * gutter);
}

// The card's box for a window: the viewport width less the gutter each side, under the card's
// own cap; Settings and the sheets also stop at the card height cap.
export function modalFrame(size: ModalSize, window: Window, gutter: number): ModalFrame {
  const cap = window.height * CARD_HEIGHT_CAP_FRACTION;
  const fill = window.height - 2 * gutter;
  if (size === 'gate') {
    const step = gateClass(window);
    const content = GATE_CONTENT[step];
    return {
      width: fitWidth(window, gutter, GATE_MAX_WIDTH_PX[step]),
      maxHeight: fill,
      height: null,
      header: content,
      body: content,
    };
  }
  if (size === 'confirm')
    return {
      width: fitWidth(window, gutter, CONFIRM_MAX_WIDTH_PX),
      maxHeight: fill,
      height: null,
      header: CONFIRM_CONTENT,
      body: CONFIRM_CONTENT,
    };
  const step = window.width <= SETTINGS_NARROW_MAX_WIDTH_PX ? 'narrow' : 'roomy';
  return {
    width: fitWidth(window, gutter, settingsMaxWidth(window, size)),
    maxHeight: cap,
    height: settingsWide(window, size) ? Math.min(cap, WIDE_CARD_HEIGHT_CEILING_PX) : null,
    header: SETTINGS_HEADER[step],
    body: SETTINGS_SCROLL[step],
  };
}

type Bezier = readonly [number, number, number, number];

// dialogFlyFromOrigin: the card leaves the opener small, pulls back toward it, and lands through a
// decaying overshoot. `reach` scales the opener offset; each keyframe's easing runs to the next.
export const FLY_IN_DURATION_MS = 360;
export const FLY_IN_TRANSFORM: readonly {
  at: number;
  reach: number;
  scale: number;
  easing: Bezier | null;
}[] = [
  { at: 0, reach: 1, scale: 0.22, easing: [0.4, 0, 0.6, 1] },
  { at: 0.08, reach: 1.06, scale: 0.2, easing: [0.16, 1, 0.3, 1] },
  { at: 0.74, reach: 0, scale: 1.032, easing: [0.45, 0, 0.55, 1] },
  { at: 0.89, reach: 0, scale: 0.994, easing: [0.33, 1, 0.68, 1] },
  { at: 1, reach: 0, scale: 1, easing: null },
];
export const FLY_IN_OPACITY: readonly { at: number; opacity: number; easing: Bezier | null }[] = [
  { at: 0, opacity: 0, easing: [0.4, 0, 0.6, 1] },
  { at: 0.08, opacity: 0.5, easing: [0.16, 1, 0.3, 1] },
  { at: 0.38, opacity: 1, easing: null },
];

// dialogFlyBack: most of the way toward the opener, never all of it.
export const FLY_BACK_REACH = 0.7;
export const FLY_BACK_SCALE = 0.4;

// --duration-base, --duration-exit and --ease-glide, plus CSS `ease` and its reverse, which the
// scrim's exit plays as `modalFadeIn ... ease reverse`.
export const MODAL_FADE_MS = 200;
export const MODAL_EXIT_MS = 200;
export const EASE_GLIDE: Bezier = [0.22, 1, 0.36, 1];
export const CSS_EASE: Bezier = [0.25, 0.1, 0.25, 1];
export const CSS_EASE_REVERSED: Bezier = [0.75, 0, 0.75, 0.9];

const CORNERS = 4;
const PERCENT = 100;

function cornerPercents(list: string) {
  const values = list.trim().split(/\s+/).map(Number.parseFloat);
  if (values.length < 1 || values.length > CORNERS || values.some(Number.isNaN))
    throw new Error(`Unexpected radius list: ${list}`);
  const [a, b = a, c = a, d = b] = values;
  return [a, b, c, d] as const;
}

const round = (value: number) => Math.round(value * PERCENT) / PERCENT;

// A CSS percentage border-radius shorthand as an SVG outline of a width × height box, inset so a
// centered stroke of twice the inset lands where a CSS border of that width would. Corners that
// overlap shrink together, as CSS scales them.
export function blobPath(shorthand: string, width: number, height: number, inset = 0) {
  const [across, down = across] = shorthand.split('/');
  const rx = cornerPercents(across).map((percent) => (percent / PERCENT) * width);
  const ry = cornerPercents(down).map((percent) => (percent / PERCENT) * height);
  const [tl, tr, br, bl] = [0, 1, 2, 3];
  const fit = Math.min(
    1,
    width / (rx[tl] + rx[tr]),
    width / (rx[bl] + rx[br]),
    height / (ry[tl] + ry[bl]),
    height / (ry[tr] + ry[br])
  );
  const x = rx.map((radius) => round(Math.max(0, radius * fit - inset)));
  const y = ry.map((radius) => round(Math.max(0, radius * fit - inset)));
  const [left, top, right, bottom] = [inset, inset, width - inset, height - inset];
  const arc = (corner: number, endX: number, endY: number) =>
    `A${x[corner]} ${y[corner]} 0 0 1 ${round(endX)} ${round(endY)}`;
  return [
    `M${round(left + x[tl])} ${top}`,
    `H${round(right - x[tr])}`,
    arc(tr, right, top + y[tr]),
    `V${round(bottom - y[br])}`,
    arc(br, right - x[br], bottom),
    `H${round(left + x[bl])}`,
    arc(bl, left, bottom - y[bl]),
    `V${round(top + y[tl])}`,
    arc(tl, left + x[tl], top),
    'Z',
  ].join(' ');
}
