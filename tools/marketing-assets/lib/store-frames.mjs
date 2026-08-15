// The store-screenshot frame design system (2026-08 refresh): page copy, the
// shared layout geometry, the crayon-doodle corner marks, and the HTML each
// final store image is rendered from. Captured app screenshots are placed
// pixel-for-pixel inside the frame; page 04 is a composed doodle→masterpiece
// showcase with no app capture.
//
// The geometry is authored at the Google Play sizes (landscape 1920×1080,
// portrait 1080×1920) and scaled linearly by width for the App Store sizes, so
// one spec produces every store slot.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { paletteHex } from '../../../web/src/lib/palette.ts';

// ── Design tokens (from the design handoff) ─────────────────────────────────

const INK = '#453d63';
const INK_MUTED = '#6b6284';
const INK_ON_DARK = '#eceaf2';
const INK_MUTED_ON_DARK = '#cfccdb';
const LIGHT_BG = 'linear-gradient(120deg, #fbfaff 0%, #f3edfc 55%, #ece3f9 100%)';
const DARK_BG = 'linear-gradient(120deg, #201d2e 0%, #191624 55%, #151221 100%)';
const FRAME_SHADOW = '0 30px 80px rgba(60,40,110,.28)';
const FRAME_RADIUS_PX = 24;
const POLAROID_PAPER = '#fdfcf7';
const POLAROID_CAPTION_COLOR = '#7c50bb';
const CRESCENT_LAVENDER = '#b9a8e8';

const HEADLINE_PX = 78;
const SUB_PX = 33;

// Landscape spec (1920×1080 base): copy column x=96 w=470, frame x=600 y=57
// 1360×966 bleeding off the right edge, app UI at ~1.5× native scale.
const L_BASE_W = 1920;
const L_COPY_X = 96;
const L_COPY_W = 470;
const L_FRAME_X = 600;
const L_FRAME_W = 1360;
const L_FRAME_Y = 57;
const L_APP_SCALE = 1.5;

// Portrait reflow (1080×1920 base, per the handoff's capture notes): copy block
// top-left, frame below with side margins, fully visible (the portrait app
// keeps its toolbar at the bottom edge, so the frame must not bleed).
const P_BASE_W = 1080;
const P_MARGIN = 84;
const P_COPY_TOP = 96;
const P_FRAME_Y = 560;
const P_BOTTOM_MARGIN = 85;
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
  const margin = Math.round(P_MARGIN * k);
  const frame = {
    x: margin,
    y: Math.round(P_FRAME_Y * k),
    width: W - 2 * margin,
    height: H - Math.round(P_FRAME_Y * k) - Math.round(P_BOTTOM_MARGIN * k),
  };
  const deviceScaleFactor = frame.width / P_CAPTURE_CSS_W;
  const cssH = Math.round(frame.height / deviceScaleFactor);
  frame.height = Math.round(cssH * deviceScaleFactor);
  return {
    k,
    orientation,
    frame,
    copy: { x: margin, top: Math.round(P_COPY_TOP * k), width: W - 2 * margin },
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
    sub: 'Optional AI art — a grown-up always holds the key',
    showcase: true,
  },
  {
    id: '05-parents',
    title: 'No ads. No tracking. Nothing to buy.',
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

const mark = (kind, color, x, y, { scale = 1, rot = 0 } = {}) => ({
  kind,
  color,
  x,
  y,
  scale,
  rot,
});
const dotMark = (color, x, y, d) => ({ kind: 'dot', color, x, y, d });

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

// Per-page mark sets in base coordinates. Landscape slots live in the left
// whitespace and the strip left of the frame; portrait re-slots the same set
// around the copy block (top corners, right edge, the gap above the frame).
const PAGE_MARKS = {
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

// Portrait re-slots, in the same order as each landscape set: the strip above
// the copy block (left), top-right, the right edge beside the headline's short
// second line, the gap above the frame (left), and a small counterweight dot
// on the right of that gap. Slot A stays small and above y≈60 so it clears the
// logo row / headline that start at y=96.
const PORTRAIT_MARK_SLOTS = [
  { x: 78, y: 18, scale: 0.72 },
  { x: 886, y: 48 },
  { x: 1008, y: 212 },
  { x: 70, y: 498, scale: 0.85 },
  { x: 1004, y: 500 },
];

function marksFor(page, orientation) {
  const set = PAGE_MARKS[page.id];
  if (orientation === 'landscape') return set;
  return set.map((m, i) => {
    const slot = PORTRAIT_MARK_SLOTS[i];
    return { ...m, x: slot.x, y: slot.y, scale: (m.scale ?? 1) * (slot.scale ?? 1) };
  });
}

// Landscape mark Y scales with frame HEIGHT, not width: the copy column is
// vertically centered, so on the taller 4:3 iPad a width-scaled bottom mark
// would land inside the copy block instead of the bottom whitespace. On the
// 16:9 base the two scales are identical.
function marksHtml(page, orientation, k, target) {
  const yScale = orientation === 'landscape' ? target.height / 1080 : k;
  return marksFor(page, orientation)
    .map((m) => {
      const x = Math.round(m.x * k);
      const y = Math.round(m.y * yScale);
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
// wand-stars icon.
function showcaseHtml(geo, assets) {
  const k = geo.k;
  const s = (v) => Math.round(v * k);
  const layout =
    geo.orientation === 'landscape'
      ? {
          doodle: { x: 640, y: 310, w: 550 },
          wand: { x: 1225, y: 420, w: 115 },
          polaroid: { x: 1345, y: 235, w: 545 },
        }
      : {
          doodle: { x: 140, y: 575, w: 620 },
          wand: { x: 495, y: 1130, w: 120 },
          polaroid: { x: 280, y: 1315, w: 630 },
        };
  const sparkY = { x: layout.wand.x - 34, y: layout.wand.y - 26, w: 30 };
  const sparkP = {
    x: layout.wand.x + layout.wand.w + 6,
    y: layout.wand.y + layout.wand.w - 24,
    w: 22,
  };
  return `
  <img class="showcase-doodle" style="left:${s(layout.doodle.x)}px;top:${s(layout.doodle.y)}px;width:${s(layout.doodle.w)}px"
    src="data:image/jpeg;base64,${assets.aiBeforeB64}">
  <div class="showcase-wand" style="left:${s(layout.wand.x)}px;top:${s(layout.wand.y)}px;width:${s(layout.wand.w)}px">${assets.wandSvg}</div>
  <span class="mark" style="left:${s(sparkY.x)}px;top:${s(sparkY.y)}px;width:${s(sparkY.w)}px">${MARKS.sparkle(paletteHex('Yellow'))}</span>
  <span class="mark" style="left:${s(sparkP.x)}px;top:${s(sparkP.y)}px;width:${s(sparkP.w)}px">${MARKS.sparkle(paletteHex('Pink'))}</span>
  <div class="polaroid" style="left:${s(layout.polaroid.x)}px;top:${s(layout.polaroid.y)}px;width:${s(layout.polaroid.w)}px">
    <img src="data:image/jpeg;base64,${assets.aiAfterB64}">
    <div class="polaroid-caption">AI-generated picture</div>
  </div>`;
}

export function storePageHtml(target, geo, page, assets, shotBuffer) {
  const k = geo.k;
  const px = (v) => `${Math.round(v * k)}px`;
  const dark = Boolean(page.dark);
  const frameImg = shotBuffer
    ? `<img class="frame" src="data:image/png;base64,${shotBuffer.toString('base64')}">`
    : showcaseHtml(geo, assets);
  const copyLayout =
    geo.orientation === 'landscape'
      ? `.copy { left: ${geo.copy.x}px; top: 0; bottom: 0; width: ${geo.copy.width}px; justify-content: center; }`
      : `.copy { left: ${geo.copy.x}px; top: ${geo.copy.top}px; width: ${geo.copy.width}px; }`;
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
    .logo { display: flex; align-items: center; gap: ${px(16)}; margin-bottom: ${px(26)}; }
    .logo img { width: ${px(64)}; height: ${px(64)}; border-radius: ${px(15)}; }
    .logo span { font-size: ${px(44)}; font-weight: 700; color: ${INK}; letter-spacing: -0.5px; }
    h1 {
      font-size: ${px(HEADLINE_PX)}; font-weight: 700; line-height: 1.06;
      letter-spacing: ${(-1 * k).toFixed(2)}px; color: ${dark ? INK_ON_DARK : INK};
    }
    .sub {
      margin-top: ${px(22)}; font-size: ${px(SUB_PX)}; font-weight: 600;
      line-height: 1.38; color: ${dark ? INK_MUTED_ON_DARK : INK_MUTED};
    }
    .chips { margin-top: ${px(30)}; display: flex; flex-wrap: wrap; gap: ${px(12)}; }
    .chip {
      display: inline-flex; align-items: center; gap: ${px(10)};
      background: #fff; border-radius: 999px; padding: ${px(10)} ${px(20)};
      font-size: ${px(27)}; font-weight: 600; color: ${INK};
      box-shadow: 0 ${px(6)} ${px(18)} rgba(60,40,110,.10);
    }
    .chip i { width: ${px(12)}; height: ${px(12)}; border-radius: 50%; }
    .frame {
      position: absolute; z-index: 3;
      left: ${geo.frame.x}px; top: ${geo.frame.y}px;
      width: ${geo.frame.width}px; height: ${geo.frame.height}px;
      border-radius: ${px(FRAME_RADIUS_PX)};
      box-shadow: ${FRAME_SHADOW};
    }
    .showcase-doodle {
      position: absolute; z-index: 3; transform: rotate(-2deg);
      border-radius: ${px(FRAME_RADIUS_PX)}; box-shadow: ${FRAME_SHADOW};
    }
    .showcase-wand { position: absolute; z-index: 4; transform: rotate(-10deg); }
    .showcase-wand svg { display: block; width: 100%; height: auto; }
    .polaroid {
      position: absolute; z-index: 3; transform: rotate(3deg);
      background: ${POLAROID_PAPER}; padding: ${px(16)} ${px(16)} 0;
      border-radius: ${px(10)}; box-shadow: ${FRAME_SHADOW};
    }
    .polaroid img { display: block; width: 100%; border-radius: ${px(4)}; }
    .polaroid-caption {
      text-align: center; font-size: ${px(27)}; font-weight: 600;
      color: ${POLAROID_CAPTION_COLOR}; padding: ${px(14)} 0 ${px(16)};
    }
  </style></head>
  <body>
    ${marksHtml(page, geo.orientation, k, target)}
    ${copyBlockHtml(page, assets)}
    ${frameImg}
  </body></html>`;
}
