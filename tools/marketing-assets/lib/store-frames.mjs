// The store-screenshot frame design system: page copy, the shared layout
// geometry, the crayon-doodle marks, and the HTML each final store image is
// rendered from. Captured app screenshots are placed pixel-for-pixel inside
// the frame; page 04 is a composed doodle→masterpiece showcase with no app
// capture.
//
// The geometry is authored at the Google Play sizes (landscape 1920×1080,
// portrait 1080×1920) and scaled linearly by width for the App Store sizes, so
// one spec produces every store slot. Landscape (the 2026-08 refresh) puts the
// copy in a left column with the frame bleeding off the right edge. Portrait
// (the 2026-08 portrait v2 handoff) centers the copy in a zone above a fully
// visible frame; the handoff specified output pixels at the App Store 6.9"
// slot (1290×2796), stored here divided by that slot's k = 1290/1080.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { paletteHex } from '../../../web/src/lib/palette.ts';

// ── Design tokens (from the design handoff) ─────────────────────────────────

const INK = '#453d63';
const INK_MUTED = '#6b6284';
const INK_ON_DARK = '#eceaf2';
const INK_MUTED_ON_DARK = '#cfccdb';
const LIGHT_BG = 'linear-gradient(165deg, #fbfaff 0%, #f4eefc 48%, #ebe1f8 100%)';
const DARK_BG = 'linear-gradient(165deg, #221e31 0%, #191624 55%, #141120 100%)';
const POLAROID_PAPER = '#fdfcf7';
const POLAROID_CAPTION_COLOR = '#7c50bb';
const CRESCENT_LAVENDER = '#b9a8e8';

// The dark parent-trust page swaps the purple-tinted frame shadow for a plain
// black one — a purple glow reads as a smudge on the dark gradient.
const FRAME_SHADOW_SPEC = {
  landscape: {
    light: { y: 30, blur: 80, color: 'rgba(60,40,110,.28)' },
    dark: { y: 33, blur: 88, color: 'rgba(0,0,0,.55)' },
  },
  portrait: {
    light: { y: 33.5, blur: 75.4, color: 'rgba(60,40,110,.30)' },
    dark: { y: 36.8, blur: 80.4, color: 'rgba(0,0,0,.55)' },
  },
};
const FRAME_RADIUS = { landscape: 24, portrait: 28.5 };

// Typography differs by orientation: the centered portrait copy zone carries
// larger type than the landscape column. Base-space px, multiplied by each
// orientation's k.
const TYPE_SPEC = {
  landscape: {
    headline: 78,
    headlineLineHeight: 1.06,
    letterSpacing: -1,
    sub: 33,
    subLineHeight: 1.38,
    subMarginTop: 22,
    logoIcon: 64,
    logoRadius: 15,
    logoText: 44,
    logoGap: 16,
    logoMarginBottom: 26,
  },
  portrait: {
    headline: 80.4,
    headlineLineHeight: 1.08,
    letterSpacing: -1.26,
    sub: 38.5,
    subLineHeight: 1.35,
    subMarginTop: 21.8,
    logoIcon: 77,
    logoRadius: 18.4,
    logoText: 48.6,
    logoGap: 18,
    logoMarginBottom: 26,
  },
};

const CHIP_SPEC = {
  font: 27.6,
  padY: 13.4,
  padX: 25.1,
  dot: 13.4,
  gap: 13.4,
  labelGap: 10,
  shadowY: 6.7,
  shadowBlur: 20.1,
};

// Landscape spec (1920×1080 base): copy column x=96 w=470, frame x=600 y=57
// 1360×966 bleeding off the right edge, app UI at ~1.5× native scale.
const L_BASE_W = 1920;
const L_COPY_X = 96;
const L_COPY_W = 470;
const L_FRAME_X = 600;
const L_FRAME_W = 1360;
const L_FRAME_Y = 57;
const L_APP_SCALE = 1.5;

// Portrait reflow (1080×1920 base, per the portrait v2 handoff): copy centered
// both axes in a zone spanning the full width above the frame, frame fully
// visible below (the portrait app keeps its toolbar at the bottom edge, so
// the frame must not bleed).
const P_BASE_W = 1080;
const P_COPY_SIDE = 75;
const P_COPY_H = 536;
const P_FRAME_MARGIN = 71;
const P_FRAME_Y = 536;
const P_BOTTOM_MARGIN = 63;
// Fixed capture width, NOT a fixed app scale: it must stay under the app's
// 600px tablet-class floor (TABLET_MIN_SIDE_PX) or the portrait app defaults
// to forced-landscape paper. 576 keeps every portrait target phone-class at
// ~1.6× native scale.
const P_CAPTURE_CSS_W = 576;

export function frameGeometry(target) {
  const { width: W, height: H, orientation } = target;
  if (orientation === 'landscape') {
    const k = W / L_BASE_W;
    const frame = {
      x: Math.round(L_FRAME_X * k),
      y: Math.round(L_FRAME_Y * k),
      width: Math.round(L_FRAME_W * k),
      height: H - 2 * Math.round(L_FRAME_Y * k),
    };
    const cssW = Math.round(frame.width / (L_APP_SCALE * k));
    const deviceScaleFactor = frame.width / cssW;
    const cssH = Math.round(frame.height / deviceScaleFactor);
    frame.height = Math.round(cssH * deviceScaleFactor);
    return {
      k,
      orientation,
      frame,
      copy: { x: Math.round(L_COPY_X * k), width: Math.round(L_COPY_W * k) },
      capture: { width: cssW, height: cssH, deviceScaleFactor },
    };
  }
  const k = W / P_BASE_W;
  const margin = Math.round(P_FRAME_MARGIN * k);
  const frame = {
    x: margin,
    y: Math.round(P_FRAME_Y * k),
    width: W - 2 * margin,
    height: H - Math.round(P_FRAME_Y * k) - Math.round(P_BOTTOM_MARGIN * k),
  };
  const deviceScaleFactor = frame.width / P_CAPTURE_CSS_W;
  const cssH = Math.round(frame.height / deviceScaleFactor);
  frame.height = Math.round(cssH * deviceScaleFactor);
  const copySide = Math.round(P_COPY_SIDE * k);
  return {
    k,
    orientation,
    frame,
    copy: { x: copySide, top: 0, width: W - 2 * copySide, height: Math.round(P_COPY_H * k) },
    capture: { width: P_CAPTURE_CSS_W, height: cssH, deviceScaleFactor },
  };
}

// ── Page copy ───────────────────────────────────────────────────────────────

export const STORE_PAGES = [
  {
    id: '01-draw',
    title: 'Just open and draw',
    sub: 'Big, chunky strokes made for little hands',
    logo: true,
    chips: [
      { label: 'Ages 2+', color: paletteHex('Green') },
      { label: 'Works offline', color: paletteHex('Blue') },
      { label: 'Free & open source', color: paletteHex('Orange') },
    ],
  },
  {
    id: '02-books',
    title: '48 pages to color, in 8 little books',
    sub: 'Farm animals, dinosaurs, rockets, trucks, and more',
  },
  {
    id: '03-magic',
    title: 'Scribble free, or flip on the magic brush',
    sub: 'In magic mode, every happy swipe stays inside the lines',
  },
  {
    id: '04-ai',
    title: 'Turn a doodle into a masterpiece',
    // The old "a grown-up always holds the key" only made sense if you already
    // knew the AI flow is BYOK; this reads without that context.
    sub: 'Optional AI art — it stays off until a parent unlocks it',
    showcase: true,
  },
  {
    id: '05-parents',
    // Explicit break; "Nothing to buy" was dropped because BYOK is technically
    // a purchase.
    title: 'No Accounts.<br>No Ads. No Tracking.',
    sub: 'Parents set the guardrails. Kids just draw.',
    dark: true,
  },
];

// ── Crayon-doodle corner marks ──────────────────────────────────────────────
// Hand-drawn-looking SVG doodles in palette colors (round caps, stroke-based),
// a themed set per page, kept in the whitespace so they never sit over the
// frame or copy.

const stroked = (w, h, inner) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const MARKS = {
  loop: (c) =>
    stroked(
      88,
      54,
      `<path stroke="${c}" stroke-width="6.5" d="M4 44 C10 18 30 12 30 28 C30 42 14 44 18 30 C23 12 43 8 44 24 C45 39 28 42 32 28 C37 11 58 8 62 22 C65 34 54 39 57 43 C60 47 74 40 84 28"/>`
    ),
  zigzag: (c) =>
    stroked(
      58,
      30,
      `<path stroke="${c}" stroke-width="6" d="M4 24 L14 7 L24 24 L34 7 L44 24 L54 7"/>`
    ),
  rainbow: (c) =>
    stroked(
      96,
      58,
      `<path stroke="${paletteHex('Red')}" stroke-width="7" d="M6 52 A42 42 0 0 1 90 52"/>` +
        `<path stroke="${paletteHex('Yellow')}" stroke-width="7" d="M18 52 A30 30 0 0 1 78 52"/>` +
        `<path stroke="${paletteHex('Blue')}" stroke-width="7" d="M30 52 A18 18 0 0 1 66 52"/>`
    ),
  daisy: (c) => {
    const petals = Array.from({ length: 6 }, (_, i) => {
      const a = i * 60;
      return `<ellipse cx="32" cy="17" rx="8.5" ry="14" fill="${c}" transform="rotate(${a} 32 33)"/>`;
    }).join('');
    return `<svg viewBox="0 0 64 66">${petals}<circle cx="32" cy="33" r="8.5" fill="${paletteHex('Yellow')}"/></svg>`;
  },
  starOutline: (c) =>
    stroked(
      52,
      50,
      `<path stroke="${c}" stroke-width="5.5" d="M26 3 L32.3 19.5 L50 20 L36 31 L41 48 L26 38 L11 48 L16 31 L2 20 L19.7 19.5 Z"/>`
    ),
  heartOutline: (c) =>
    stroked(
      52,
      48,
      `<path stroke="${c}" stroke-width="5.5" d="M26 42 C6 28 2 12 14 7 C22 4 26 12 26 15 C26 12 30 4 38 7 C50 12 46 28 26 42 Z"/>`
    ),
  dashedSwoosh: (c) =>
    stroked(
      112,
      56,
      `<path stroke="${c}" stroke-width="6.5" stroke-dasharray="15 15" d="M6 48 C34 10 78 8 106 22"/>`
    ),
  sparkle: (c) =>
    `<svg viewBox="0 0 36 36"><path fill="${c}" d="M18 2 C20 12 24 16 34 18 C24 20 20 24 18 34 C16 24 12 20 2 18 C12 16 16 12 18 2 Z"/></svg>`,
  shootingStar: (c) =>
    stroked(
      92,
      50,
      `<path stroke="${c}" stroke-width="5" d="M4 16 L32 16"/><path stroke="${c}" stroke-width="5" d="M10 30 L34 30"/>` +
        `<path fill="${c}" stroke="${c}" stroke-width="3" d="M66 6 L70.7 18.4 L83 19.5 L73.5 27.2 L76.1 40.4 L66 33.5 L55.9 40.4 L58.5 27.2 L49 19.5 L61.3 18.4 Z"/>`
    ),
  wave: (c) =>
    stroked(
      64,
      24,
      `<path stroke="${c}" stroke-width="6" d="M3 15 C9 5 15 5 21 13 C27 21 33 21 39 13 C45 5 51 5 57 13"/>`
    ),
  crescent: (c) =>
    stroked(
      48,
      52,
      `<path stroke="${c}" stroke-width="5.5" d="M33 5 A22 22 0 1 0 43 40 A18 18 0 0 1 33 5 Z"/>`
    ),
  swirl: (c) =>
    stroked(
      44,
      44,
      `<path stroke="${c}" stroke-width="5.5" d="M22 9 a12 12 0 1 1 -12 12 a9 9 0 1 0 9 -9 a5 5 0 1 1 -5 5"/>`
    ),
};

// `fromBottom` anchors a mark to the page's bottom edge (y is the offset up
// from it) — used by the portrait AI page, whose lower marks sit beside the
// polaroid regardless of how tall the slot is.
const mark = (kind, color, x, y, { scale = 1, rot = 0, fromBottom = false } = {}) => ({
  kind,
  color,
  x,
  y,
  scale,
  rot,
  fromBottom,
});
const dotMark = (color, x, y, d, { fromBottom = false } = {}) => ({
  kind: 'dot',
  color,
  x,
  y,
  d,
  fromBottom,
});

// Base widths each mark kind renders at (before per-mark scale), so positions
// stay stable while a doodle is retuned.
const MARK_BASE_W = {
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

// Landscape mark sets in base coordinates: the left whitespace and the strip
// left of the frame.
const LANDSCAPE_PAGE_MARKS = {
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
  '04-ai': [
    mark('shootingStar', paletteHex('Yellow'), 48, 56, { rot: -8 }),
    mark('swirl', paletteHex('Pink'), 484, 48),
    dotMark(paletteHex('Blue'), 396, 116, 15),
    mark('wave', paletteHex('Purple'), 72, 914),
    dotMark(paletteHex('Green'), 464, 916, 16),
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
const PORTRAIT_PAGE_MARKS = {
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

const marksFor = (page, orientation) =>
  (orientation === 'landscape' ? LANDSCAPE_PAGE_MARKS : PORTRAIT_PAGE_MARKS)[page.id];

// Landscape mark Y scales with frame HEIGHT, not width: the copy column is
// vertically centered, so on the taller 4:3 iPad a width-scaled bottom mark
// would land inside the copy block instead of the bottom whitespace. On the
// 16:9 base the two scales are identical.
function marksHtml(page, orientation, k, target) {
  const yScale = orientation === 'landscape' ? target.height / 1080 : k;
  return marksFor(page, orientation)
    .map((m) => {
      const x = Math.round(m.x * k);
      const yFromTop = Math.round(m.y * yScale);
      const y = m.fromBottom ? target.height - yFromTop : yFromTop;
      if (m.kind === 'dot') {
        const d = Math.round(m.d * k);
        return `<span class="mark" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;border-radius:50%;background:${m.color}"></span>`;
      }
      const w = Math.round(MARK_BASE_W[m.kind] * m.scale * k);
      return `<span class="mark" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${m.rot}deg)">${MARKS[m.kind](m.color)}</span>`;
    })
    .join('\n');
}

// ── Shared assets ───────────────────────────────────────────────────────────

const MODEL_EVAL_ASSETS = join(ROOT, 'scrapbook', 'model-eval', 'prompt-adherence', 'assets');

export function loadFrameAssets() {
  return {
    fontB64: readFileSync(
      join(
        ROOT,
        'node_modules',
        '@fontsource-variable',
        'quicksand',
        'files',
        'quicksand-latin-wght-normal.woff2'
      )
    ).toString('base64'),
    appIconB64: readFileSync(join(ROOT, 'web', 'static', 'web-app-manifest-192x192.png')).toString(
      'base64'
    ),
    wandSvg: readFileSync(join(ROOT, 'web', 'src', 'lib', 'icons', 'wand-stars.svg'), 'utf8'),
    aiBeforeB64: readFileSync(join(MODEL_EVAL_ASSETS, 'in__line__house-sun__wide.jpg')).toString(
      'base64'
    ),
    aiAfterB64: readFileSync(
      join(MODEL_EVAL_ASSETS, 'line__house-sun__wide__overlay-rich__1.jpg')
    ).toString('base64'),
  };
}

// ── Page HTML ───────────────────────────────────────────────────────────────

function copyBlockHtml(page, assets) {
  const logo = page.logo
    ? `<div class="logo"><img src="data:image/png;base64,${assets.appIconB64}"><span>Splotch</span></div>`
    : '';
  const chips = page.chips
    ? `<div class="chips">${page.chips
        .map((c) => `<span class="chip"><i style="background:${c.color}"></i>${c.label}</span>`)
        .join('')}</div>`
    : '';
  return `<div class="copy">${logo}<h1>${page.title}</h1><p class="sub">${page.sub}</p>${chips}</div>`;
}

// Page 04's doodle→masterpiece showcase: a real child-style drawing and the
// real generation it produced (scrapbook/model-eval), joined by the app's own
// wand-stars icon with a stepping-stone connector — palette-color stones trail
// from the doodle into the wand, growing sparkles burst out toward the
// polaroid. The wand is never rotated: its AI badge must read flat.
const SHOWCASE_SPEC = {
  landscape: {
    doodle: { x: 620, y: 290, w: 530 },
    wand: { x: 1210, y: 430, w: 115 },
    polaroid: { x: 1370, y: 235, w: 530 },
    stones: [
      { x: 1090, y: 660, d: 24, color: 'Purple' },
      { x: 1140, y: 622, d: 20, color: 'Blue' },
      { x: 1186, y: 582, d: 26, color: 'Green' },
      { x: 1224, y: 540, d: 20, color: 'Yellow' },
    ],
    sparkles: [
      { x: 1338, y: 400, w: 34, color: 'Orange' },
      { x: 1356, y: 352, w: 40, color: 'Pink' },
      { x: 1344, y: 302, w: 36, color: 'Blue' },
      { x: 1316, y: 252, w: 46, color: 'Yellow' },
    ],
  },
  portrait: {
    doodle: { x: 88, y: 603, w: 737 },
    wand: { x: 687, y: 1236, w: 199 },
    polaroid: { x: 251, y: 1515, w: 754 },
    stones: [
      { x: 487, y: 1113, d: 40, color: 'Purple' },
      { x: 579, y: 1140, d: 33, color: 'Blue' },
      { x: 662, y: 1174, d: 43, color: 'Green' },
      { x: 720, y: 1218, d: 33, color: 'Yellow' },
    ],
    sparkles: [
      { x: 764, y: 1347, w: 61, color: 'Orange' },
      { x: 720, y: 1400, w: 74, color: 'Pink' },
      { x: 672, y: 1451, w: 64, color: 'Blue' },
      { x: 607, y: 1474, w: 83, color: 'Yellow' },
    ],
  },
};

// The portrait showcase is authored against the App Store 6.9" slot's height
// (2796 output px / k = 2341 base px). The Play phone slot is proportionally
// shorter (1920), so the whole composition scales down uniformly around the
// page's horizontal center — extra whitespace instead of overflow, with the
// connector arc's geometry intact.
const P_SHOWCASE_DESIGN_H = 2341;

function showcaseHtml(geo, assets, target) {
  const k = geo.k;
  const spec = SHOWCASE_SPEC[geo.orientation];
  const v =
    geo.orientation === 'portrait' ? Math.min(1, target.height / k / P_SHOWCASE_DESIGN_H) : 1;
  const sx = (x) => Math.round(k * (x * v + (P_BASE_W / 2) * (1 - v)));
  const sy = (y) => Math.round(y * v * k);
  const sw = (w) => Math.round(w * v * k);
  const stones = spec.stones
    .map(
      (s) =>
        `<span class="mark" style="left:${sx(s.x)}px;top:${sy(s.y)}px;width:${sw(s.d)}px;height:${sw(s.d)}px;border-radius:50%;background:${paletteHex(s.color)}"></span>`
    )
    .join('\n');
  const sparkles = spec.sparkles
    .map(
      (s) =>
        `<span class="mark" style="left:${sx(s.x)}px;top:${sy(s.y)}px;width:${sw(s.w)}px">${MARKS.sparkle(paletteHex(s.color))}</span>`
    )
    .join('\n');
  return `
  <img class="showcase-doodle" style="left:${sx(spec.doodle.x)}px;top:${sy(spec.doodle.y)}px;width:${sw(spec.doodle.w)}px"
    src="data:image/jpeg;base64,${assets.aiBeforeB64}">
  ${stones}
  <div class="showcase-wand" style="left:${sx(spec.wand.x)}px;top:${sy(spec.wand.y)}px;width:${sw(spec.wand.w)}px">${assets.wandSvg}</div>
  ${sparkles}
  <div class="polaroid" style="left:${sx(spec.polaroid.x)}px;top:${sy(spec.polaroid.y)}px;width:${sw(spec.polaroid.w)}px">
    <img src="data:image/jpeg;base64,${assets.aiAfterB64}">
    <div class="polaroid-caption">AI-generated picture</div>
  </div>`;
}

// The doodle card and polaroid carry their own portrait dimensions from the
// handoff (28 / 14 output px radii, 22px paper padding, 34px caption).
const SHOWCASE_CARD_SPEC = {
  landscape: { doodleRadius: 24, polaroidRadius: 10, pad: 16, caption: 27, captionPad: [14, 16] },
  portrait: {
    doodleRadius: 23.4,
    polaroidRadius: 11.7,
    pad: 18.4,
    caption: 28.5,
    captionPad: [16, 18],
  },
};

export function storePageHtml(target, geo, page, assets, shotBuffer) {
  const k = geo.k;
  const px = (v) => `${Math.round(v * k)}px`;
  const dark = Boolean(page.dark);
  const isPortrait = geo.orientation === 'portrait';
  const type = TYPE_SPEC[geo.orientation];
  const card = SHOWCASE_CARD_SPEC[geo.orientation];
  const shadowSpec = FRAME_SHADOW_SPEC[geo.orientation][dark ? 'dark' : 'light'];
  const frameShadow = `0 ${px(shadowSpec.y)} ${px(shadowSpec.blur)} ${shadowSpec.color}`;
  const frameImg = shotBuffer
    ? `<img class="frame" src="data:image/png;base64,${shotBuffer.toString('base64')}">`
    : showcaseHtml(geo, assets, target);
  const copyLayout = isPortrait
    ? `.copy { left: ${geo.copy.x}px; top: ${geo.copy.top}px; width: ${geo.copy.width}px; height: ${geo.copy.height}px;
        align-items: center; justify-content: center; text-align: center; }`
    : `.copy { left: ${geo.copy.x}px; top: 0; bottom: 0; width: ${geo.copy.width}px; justify-content: center; }`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {
      font-family: 'Quicksand';
      src: url(data:font/woff2;base64,${assets.fontB64}) format('woff2-variations');
      font-weight: 300 700;
    }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: ${target.width}px; height: ${target.height}px; }
    body {
      font-family: 'Quicksand', sans-serif;
      position: relative; overflow: hidden;
      background: ${dark ? DARK_BG : LIGHT_BG};
    }
    .mark { position: absolute; z-index: 1; display: block; }
    .mark svg { display: block; width: 100%; height: auto; }
    .copy { position: absolute; z-index: 2; display: flex; flex-direction: column; align-items: flex-start; }
    ${copyLayout}
    .logo { display: flex; align-items: center; gap: ${px(type.logoGap)}; margin-bottom: ${px(type.logoMarginBottom)}; }
    .logo img { width: ${px(type.logoIcon)}; height: ${px(type.logoIcon)}; border-radius: ${px(type.logoRadius)}; }
    .logo span { font-size: ${px(type.logoText)}; font-weight: 700; color: ${INK}; letter-spacing: -0.5px; }
    h1 {
      font-size: ${px(type.headline)}; font-weight: 700; line-height: ${type.headlineLineHeight};
      letter-spacing: ${(type.letterSpacing * k).toFixed(2)}px; color: ${dark ? INK_ON_DARK : INK};
      ${isPortrait ? 'text-wrap: balance;' : ''}
    }
    .sub {
      margin-top: ${px(type.subMarginTop)}; font-size: ${px(type.sub)}; font-weight: 600;
      line-height: ${type.subLineHeight}; color: ${dark ? INK_MUTED_ON_DARK : INK_MUTED};
    }
    .chips { margin-top: ${px(30)}; display: flex; flex-wrap: wrap; justify-content: center; gap: ${px(CHIP_SPEC.gap)}; }
    .chip {
      display: inline-flex; align-items: center; gap: ${px(CHIP_SPEC.labelGap)};
      background: #fff; border-radius: 999px; padding: ${px(CHIP_SPEC.padY)} ${px(CHIP_SPEC.padX)};
      font-size: ${px(CHIP_SPEC.font)}; font-weight: 600; color: ${INK};
      box-shadow: 0 ${px(CHIP_SPEC.shadowY)} ${px(CHIP_SPEC.shadowBlur)} rgba(60,40,110,.10);
    }
    .chip i { width: ${px(CHIP_SPEC.dot)}; height: ${px(CHIP_SPEC.dot)}; border-radius: 50%; }
    .frame {
      position: absolute; z-index: 3;
      left: ${geo.frame.x}px; top: ${geo.frame.y}px;
      width: ${geo.frame.width}px; height: ${geo.frame.height}px;
      border-radius: ${px(FRAME_RADIUS[geo.orientation])};
      box-shadow: ${frameShadow};
    }
    .showcase-doodle {
      position: absolute; z-index: 3; transform: rotate(-2deg);
      border-radius: ${px(card.doodleRadius)}; box-shadow: ${frameShadow};
    }
    .showcase-wand { position: absolute; z-index: 4; }
    .showcase-wand svg { display: block; width: 100%; height: auto; }
    .polaroid {
      position: absolute; z-index: 3; transform: rotate(3deg);
      background: ${POLAROID_PAPER}; padding: ${px(card.pad)} ${px(card.pad)} 0;
      border-radius: ${px(card.polaroidRadius)}; box-shadow: ${frameShadow};
    }
    .polaroid img { display: block; width: 100%; border-radius: ${px(4)}; }
    .polaroid-caption {
      text-align: center; font-size: ${px(card.caption)}; font-weight: 600;
      color: ${POLAROID_CAPTION_COLOR}; padding: ${px(card.captionPad[0])} 0 ${px(card.captionPad[1])};
    }
  </style></head>
  <body>
    ${marksHtml(page, geo.orientation, k, target)}
    ${copyBlockHtml(page, assets)}
    ${frameImg}
  </body></html>`;
}
