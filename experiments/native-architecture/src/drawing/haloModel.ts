import type { Brush } from './brushes';
import { paperSize, paperView, semanticWidth, type PaperReference } from './paperSpace';

// Pointer Halos follow each drawing contact the way the shipping PointerHalos.svelte does: a grey
// ring just outside the stroke footprint, a rainbow band for Magic, and a filled bubble the size of
// the eraser. native-pointer-halos.test.mjs pins these against the shipping component.
export const HALO_IN_MS = 120;
export const HALO_OUT_MS = 140;
export const HALO_IN_FROM_SCALE = 0.7;
export const HALO_OUT_TO_SCALE = 1.12;
export const EASE_GLIDE = [0.22, 1, 0.36, 1] as const;
export const HALO_RAINBOW = [
  '#ff5e5e',
  '#ffa94d',
  '#ffe066',
  '#69db7c',
  '#4dabf7',
  '#b197fc',
  '#ff5e5e',
] as const;
export const RING_LINE_PX = 2;
export const RAINBOW_BAND_PX = 3;
export const HALO_LINE = 'rgb(80, 80, 80)';
export const HALO_GLOW = 'rgb(255, 255, 255)';
export const HALO_GLOW_PX = 1;
export const RING_LINE_OPACITY = 0.35;
export const RING_GLOW_OPACITY = 0.35;
export const ERASER_LINE_OPACITY = 0.7;
export const ERASER_FILL_OPACITY = 0.35;
export const ERASER_GLOW_OPACITY = 0.6;
// Enough arcs that the band reads as the shipping conic gradient rather than as visible steps.
const RAINBOW_SEGMENTS = 36;
const BEZIER_STEPS = 12;

export type HaloKind = 'ring' | 'magic' | 'eraser';
export type Halo = Readonly<{ id: number; kind: HaloKind; x: number; y: number; size: number }>;
export type ShownHalo = Readonly<{ halo: Halo; since: number; lifting: boolean }>;

export function haloKind(brush: Brush): HaloKind {
  if (brush === 'eraser') return 'eraser';
  return brush === 'magic' ? 'magic' : 'ring';
}

// The stroke footprint on screen: its semantic width at the scale the ink plane presents paper.
export function haloSize(
  width: number,
  paper: PaperReference,
  frame: Readonly<{ width: number; height: number }>
): number {
  return semanticWidth(width, paper) * paperView(frame.width, frame.height, paperSize(paper)).scale;
}

// A halo grows in where the contact lands, follows it, and lifts off where it left. Reduced motion
// shows and drops halos at once, including one still lifting when the answer flips.
export function reconcileHalos(
  shown: readonly ShownHalo[],
  live: readonly Halo[],
  now: number,
  reduced: boolean
): readonly ShownHalo[] {
  const current = new Map(live.map((halo) => [halo.id, halo]));
  const next: ShownHalo[] = [];
  for (const entry of settleHalos(shown, now)) {
    const halo = current.get(entry.halo.id);
    if (halo && !entry.lifting) {
      next.push({ ...entry, halo });
      current.delete(halo.id);
    } else if (!reduced) next.push(entry.lifting ? entry : { ...entry, since: now, lifting: true });
  }
  for (const halo of current.values()) next.push({ halo, since: now, lifting: false });
  return next;
}

export function settleHalos(shown: readonly ShownHalo[], now: number): readonly ShownHalo[] {
  const kept = shown.filter((entry) => !entry.lifting || now - entry.since < HALO_OUT_MS);
  return kept.length === shown.length ? shown : kept;
}

// When the last grow-in or lift-off among the shown halos finishes.
export function haloMotionEnd(shown: readonly ShownHalo[]) {
  return Math.max(
    -Infinity,
    ...shown.map((entry) => entry.since + (entry.lifting ? HALO_OUT_MS : HALO_IN_MS))
  );
}

export function haloMotionPending(shown: readonly ShownHalo[], now: number, reduced: boolean) {
  return !reduced && haloMotionEnd(shown) > now;
}

// The worklets plugin turns each worklet into a value captured where it is declared, not a hoisted
// function, so a worklet's callees must be declared above it (native-halo-worklets.test.mjs).
function bezier(a: number, b: number, t: number) {
  'worklet';
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

function glide(progress: number) {
  'worklet';
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const [x1, y1, x2, y2] = EASE_GLIDE;
  let low = 0;
  let high = 1;
  for (let step = 0; step < BEZIER_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (bezier(x1, x2, middle) < progress) low = middle;
    else high = middle;
  }
  return bezier(y1, y2, (low + high) / 2);
}

export function haloPose(entry: ShownHalo, now: number, reduced: boolean) {
  'worklet';
  if (reduced) return { scale: 1, opacity: 1 };
  const duration = entry.lifting ? HALO_OUT_MS : HALO_IN_MS;
  const eased = glide(Math.min(Math.max((now - entry.since) / duration, 0), 1));
  return entry.lifting
    ? { scale: 1 + (HALO_OUT_TO_SCALE - 1) * eased, opacity: 1 - eased }
    : { scale: HALO_IN_FROM_SCALE + (1 - HALO_IN_FROM_SCALE) * eased, opacity: eased };
}

function channel(hex: string, offset: number) {
  return parseInt(hex.slice(offset, offset + 2), 16);
}

function rainbowAt(turn: number) {
  const position = turn * (HALO_RAINBOW.length - 1);
  const index = Math.min(Math.floor(position), HALO_RAINBOW.length - 2);
  const mix = position - index;
  const [from, to] = [HALO_RAINBOW[index], HALO_RAINBOW[index + 1]];
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * mix)
  );
  return `rgb(${red}, ${green}, ${blue})`;
}

// The shipping conic gradient starts at twelve o'clock and turns clockwise.
export function rainbowArcs(radius: number) {
  return Array.from({ length: RAINBOW_SEGMENTS }, (_, segment) => {
    const [start, end] = [segment, segment + 1].map(
      (edge) => (edge / RAINBOW_SEGMENTS) * 2 * Math.PI - Math.PI / 2
    );
    const point = (angle: number) =>
      `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
    return {
      d: `M ${point(start)} A ${radius} ${radius} 0 0 1 ${point(end)}`,
      color: rainbowAt((segment + 0.5) / RAINBOW_SEGMENTS),
    };
  });
}
