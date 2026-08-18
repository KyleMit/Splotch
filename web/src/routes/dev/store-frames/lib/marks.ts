// The crayon-doodle corner marks: hand-drawn-looking SVG doodles in palette
// colors (round caps, stroke-based), a themed set per page, kept in the
// whitespace so they never sit over the frame or copy. Positions are authored
// in base-space coordinates (see geometry.ts) and scaled by the consumer.

import { paletteHex } from '../../../../lib/palette.ts';
import type { StoreOrientation } from './targets.ts';
import type { StorePageId } from './pages.ts';

// The dark parent-trust page's crescent moon uses a lavender outside the app
// palette so it reads as nighttime, not a purple crayon stroke.
export const CRESCENT_LAVENDER = '#b9a8e8';

const stroked = (w: number, h: number, inner: string) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const MARKS = {
  loop: (c: string) =>
    stroked(
      88,
      54,
      `<path stroke="${c}" stroke-width="6.5" d="M4 44 C10 18 30 12 30 28 C30 42 14 44 18 30 C23 12 43 8 44 24 C45 39 28 42 32 28 C37 11 58 8 62 22 C65 34 54 39 57 43 C60 47 74 40 84 28"/>`
    ),
  zigzag: (c: string) =>
    stroked(
      58,
      30,
      `<path stroke="${c}" stroke-width="6" d="M4 24 L14 7 L24 24 L34 7 L44 24 L54 7"/>`
    ),
  // The rainbow ignores the slot color: its three arcs are always red, yellow,
  // and blue.
  rainbow: (_c: string) =>
    stroked(
      96,
      58,
      `<path stroke="${paletteHex('Red')}" stroke-width="7" d="M6 52 A42 42 0 0 1 90 52"/>` +
        `<path stroke="${paletteHex('Yellow')}" stroke-width="7" d="M18 52 A30 30 0 0 1 78 52"/>` +
        `<path stroke="${paletteHex('Blue')}" stroke-width="7" d="M30 52 A18 18 0 0 1 66 52"/>`
    ),
  daisy: (c: string) => {
    const petals = Array.from({ length: 6 }, (_, i) => {
      const a = i * 60;
      return `<ellipse cx="32" cy="17" rx="8.5" ry="14" fill="${c}" transform="rotate(${a} 32 33)"/>`;
    }).join('');
    return `<svg viewBox="0 0 64 66">${petals}<circle cx="32" cy="33" r="8.5" fill="${paletteHex('Yellow')}"/></svg>`;
  },
  starOutline: (c: string) =>
    stroked(
      52,
      50,
      `<path stroke="${c}" stroke-width="5.5" d="M26 3 L32.3 19.5 L50 20 L36 31 L41 48 L26 38 L11 48 L16 31 L2 20 L19.7 19.5 Z"/>`
    ),
  heartOutline: (c: string) =>
    stroked(
      52,
      48,
      `<path stroke="${c}" stroke-width="5.5" d="M26 42 C6 28 2 12 14 7 C22 4 26 12 26 15 C26 12 30 4 38 7 C50 12 46 28 26 42 Z"/>`
    ),
  dashedSwoosh: (c: string) =>
    stroked(
      112,
      56,
      `<path stroke="${c}" stroke-width="6.5" stroke-dasharray="15 15" d="M6 48 C34 10 78 8 106 22"/>`
    ),
  sparkle: (c: string) =>
    `<svg viewBox="0 0 36 36"><path fill="${c}" d="M18 2 C20 12 24 16 34 18 C24 20 20 24 18 34 C16 24 12 20 2 18 C12 16 16 12 18 2 Z"/></svg>`,
  shootingStar: (c: string) =>
    stroked(
      92,
      50,
      `<path stroke="${c}" stroke-width="5" d="M4 16 L32 16"/><path stroke="${c}" stroke-width="5" d="M10 30 L34 30"/>` +
        `<path fill="${c}" stroke="${c}" stroke-width="3" d="M66 6 L70.7 18.4 L83 19.5 L73.5 27.2 L76.1 40.4 L66 33.5 L55.9 40.4 L58.5 27.2 L49 19.5 L61.3 18.4 Z"/>`
    ),
  wave: (c: string) =>
    stroked(
      64,
      24,
      `<path stroke="${c}" stroke-width="6" d="M3 15 C9 5 15 5 21 13 C27 21 33 21 39 13 C45 5 51 5 57 13"/>`
    ),
  crescent: (c: string) =>
    stroked(
      48,
      52,
      `<path stroke="${c}" stroke-width="5.5" d="M33 5 A22 22 0 1 0 43 40 A18 18 0 0 1 33 5 Z"/>`
    ),
  swirl: (c: string) =>
    stroked(
      44,
      44,
      `<path stroke="${c}" stroke-width="5.5" d="M22 9 a12 12 0 1 1 -12 12 a9 9 0 1 0 9 -9 a5 5 0 1 1 -5 5"/>`
    ),
} as const;

export type MarkKind = keyof typeof MARKS;

// Base widths each mark kind renders at (before per-mark scale), so positions
// stay stable while a doodle is retuned.
export const MARK_BASE_W: Record<MarkKind, number> = {
  loop: 88,
  zigzag: 58,
  rainbow: 96,
  daisy: 64,
  starOutline: 52,
  heartOutline: 52,
  dashedSwoosh: 112,
  sparkle: 36,
  shootingStar: 92,
  wave: 64,
  crescent: 48,
  swirl: 44,
};

export interface DoodleMark {
  kind: MarkKind;
  color: string;
  x: number;
  y: number;
  scale: number;
  rot: number;
  fromBottom: boolean;
}

export interface DotMark {
  kind: 'dot';
  color: string;
  x: number;
  y: number;
  d: number;
  fromBottom: boolean;
}

export type PageMark = DoodleMark | DotMark;

// `fromBottom` anchors a mark to the page's bottom edge (y is the offset up
// from it) — used by the portrait AI page, whose lower marks sit beside the
// polaroid regardless of how tall the slot is.
const mark = (
  kind: MarkKind,
  color: string,
  x: number,
  y: number,
  { scale = 1, rot = 0, fromBottom = false } = {}
): DoodleMark => ({ kind, color, x, y, scale, rot, fromBottom });
const dotMark = (
  color: string,
  x: number,
  y: number,
  d: number,
  { fromBottom = false } = {}
): DotMark => ({ kind: 'dot', color, x, y, d, fromBottom });

// Landscape mark sets in base coordinates: the left whitespace and the strip
// left of the frame.
const LANDSCAPE_PAGE_MARKS: Record<StorePageId, readonly PageMark[]> = {
  '01-draw': [
    mark('loop', paletteHex('Orange'), 52, 58, { rot: -6 }),
    mark('zigzag', paletteHex('Purple'), 476, 52, { scale: 0.9 }),
    dotMark(paletteHex('Yellow'), 398, 120, 16),
    mark('rainbow', paletteHex('Red'), 64, 868),
    dotMark(paletteHex('Green'), 464, 916, 18),
  ],
  '02-books': [
    mark('daisy', paletteHex('Pink'), 58, 50),
    mark('starOutline', paletteHex('Yellow'), 482, 42, { scale: 0.95, rot: 8 }),
    dotMark(paletteHex('Green'), 398, 120, 15),
    mark('heartOutline', paletteHex('Pink'), 72, 892, { rot: -8 }),
    dotMark(paletteHex('Blue'), 466, 916, 16),
  ],
  '03-magic': [
    mark('dashedSwoosh', paletteHex('Purple'), 48, 56, { rot: -4 }),
    mark('sparkle', paletteHex('Yellow'), 478, 40, { scale: 1.15 }),
    mark('sparkle', paletteHex('Pink'), 524, 88, { scale: 0.7 }),
    mark('sparkle', paletteHex('Blue'), 78, 906, { scale: 0.85 }),
    dotMark(paletteHex('Orange'), 468, 920, 16),
  ],
  // The only landscape page whose right half is a composition rather than an
  // app capture (SHOWCASE_SPEC), so its marks carry on past the copy column:
  // a weather-themed fill for the top strip, the gap right of the doodle, and
  // the band below the print.
  '04-ai': [
    mark('shootingStar', paletteHex('Yellow'), 48, 56, { rot: -8 }),
    mark('swirl', paletteHex('Pink'), 484, 48),
    dotMark(paletteHex('Blue'), 396, 116, 15),
    mark('wave', paletteHex('Purple'), 72, 914),
    dotMark(paletteHex('Green'), 464, 916, 16),
    mark('wave', paletteHex('Pink'), 920, 75, { scale: 0.78 }),
    mark('rainbow', paletteHex('Red'), 1620, 110, { scale: 0.83 }),
    mark('wave', paletteHex('Blue'), 1760, 280, { scale: 0.78 }),
    dotMark(paletteHex('Orange'), 1250, 220, 13),
    mark('zigzag', paletteHex('Purple'), 1230, 320, { scale: 0.83 }),
    mark('dashedSwoosh', paletteHex('Purple'), 1480, 920, { scale: 0.71, rot: -4 }),
    dotMark(paletteHex('Orange'), 1700, 960, 14),
    mark('sparkle', paletteHex('Yellow'), 980, 920, { scale: 0.67 }),
  ],
  '05-parents': [
    mark('crescent', CRESCENT_LAVENDER, 64, 44, { rot: -14 }),
    mark('starOutline', paletteHex('Yellow'), 484, 40, { scale: 0.9, rot: 8 }),
    mark('sparkle', paletteHex('Blue'), 398, 112, { scale: 0.75 }),
    mark('wave', paletteHex('Blue'), 78, 916),
    dotMark(paletteHex('Red'), 466, 916, 15),
  ],
};

// Portrait mark sets in base coordinates, re-slotted around the centered copy:
// top corners, the right edge beside the headline, and the gap above the
// frame. Page 01's positions come from the portrait v2 handoff; the other
// pages were measured from its reference renders.
const PORTRAIT_PAGE_MARKS: Record<StorePageId, readonly PageMark[]> = {
  '01-draw': [
    mark('loop', paletteHex('Orange'), 74, 62, { scale: 1.26, rot: -6 }),
    mark('zigzag', paletteHex('Purple'), 898, 74, { scale: 1.36 }),
    dotMark(paletteHex('Yellow'), 124, 211, 18),
    mark('rainbow', paletteHex('Red'), 908, 224, { scale: 1.13 }),
    dotMark(paletteHex('Green'), 923, 402, 20),
  ],
  '02-books': [
    mark('daisy', paletteHex('Pink'), 47, 67, { scale: 1.23 }),
    mark('starOutline', paletteHex('Yellow'), 918, 64, { scale: 1.42, rot: 8 }),
    dotMark(paletteHex('Green'), 951, 184, 18),
    mark('heartOutline', paletteHex('Pink'), 104, 442, { scale: 1.22, rot: -8 }),
    dotMark(paletteHex('Blue'), 931, 439, 15),
  ],
  '03-magic': [
    mark('dashedSwoosh', paletteHex('Purple'), 70, 50, { rot: -4 }),
    mark('sparkle', paletteHex('Yellow'), 941, 54, { scale: 1.2 }),
    mark('sparkle', paletteHex('Pink'), 991, 147, { scale: 0.7 }),
    mark('sparkle', paletteHex('Blue'), 64, 449, { scale: 0.85 }),
    dotMark(paletteHex('Orange'), 931, 439, 15),
  ],
  '04-ai': [
    mark('shootingStar', paletteHex('Yellow'), 64, 67, { scale: 1.22, rot: -8 }),
    mark('swirl', paletteHex('Pink'), 954, 70, { scale: 1.14 }),
    dotMark(paletteHex('Blue'), 968, 188, 15),
    mark('wave', paletteHex('Purple'), 159, 189, { fromBottom: true }),
    dotMark(paletteHex('Green'), 918, 228, 13, { fromBottom: true }),
  ],
  '05-parents': [
    mark('crescent', CRESCENT_LAVENDER, 84, 50, { scale: 1.22, rot: -14 }),
    mark('starOutline', paletteHex('Yellow'), 934, 64, { scale: 0.97, rot: 8 }),
    mark('sparkle', paletteHex('Blue'), 976, 181, { scale: 0.75 }),
    mark('wave', paletteHex('Blue'), 131, 466, { scale: 0.92 }),
    dotMark(paletteHex('Red'), 921, 466, 13),
  ],
};

export const marksFor = (pageId: StorePageId, orientation: StoreOrientation): readonly PageMark[] =>
  (orientation === 'landscape' ? LANDSCAPE_PAGE_MARKS : PORTRAIT_PAGE_MARKS)[pageId];
