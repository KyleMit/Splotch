// The store-screenshot compositions as self-contained documents: one marketing page framed for one
// store slot at its exact pixel size, or the Play feature graphic. The geometry, copy, marks and
// frame tokens are tools/marketing-assets/lib/storeFrames/; this module only lays them out, with the same
// per-value Math.round(v * k) scaling the committed sets were rendered under (ADR-0122).
// gen-store-assets.mjs screenshots each document.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scale } from '../../../src/lib/design/tokens.ts';
import { paletteHex } from '../../../src/lib/palette.ts';
import {
  CHIP_SPEC,
  DARK_BG,
  FRAME_RADIUS,
  FRAME_SHADOW_SPEC,
  INK,
  INK_MUTED,
  INK_MUTED_ON_DARK,
  INK_ON_DARK,
  LIGHT_BG,
  TYPE_SPEC,
} from './storeFrames/frameStyle.ts';
import { L_BASE_H, P_BASE_W, frameGeometry } from './storeFrames/geometry.ts';
import { MARKS, MARK_BASE_W, marksFor } from './storeFrames/marks.ts';
import { STORE_PAGES, pageHasCapture } from './storeFrames/pages.ts';
import { P_SHOWCASE_DESIGN_H, SHOWCASE_CARD_SPEC, SHOWCASE_SPEC } from './storeFrames/showcase.ts';
import { FEATURE_GRAPHIC, STORE_TARGETS } from './storeFrames/targets.ts';
import { ROOT } from '../../lib/proc.mjs';
import {
  DOCUMENT_RESET_CSS,
  QUICKSAND_STYLESHEET,
  escapeHtml,
  quicksandFiles,
} from './static-document.mjs';

// Every weight the frames set.
export const STORE_FRAME_WEIGHTS = [500, 600, 700];

const STORE_CAPTURES_DIR = join(ROOT, 'store-assets', 'captures');

// The app capture a page frames for a target, committed so the frames re-render without driving
// the app.
export const storeCaptureFile = (target, page) => join(STORE_CAPTURES_DIR, target, `${page}.png`);

const capturePath = (target, page) => `/captures/${target}/${page}.png`;
const LOGO_PATH = '/web-app-manifest-192x192.png';
const AI_BEFORE_PATH = '/ai-before.jpg';
const AI_AFTER_PATH = '/ai-after.jpg';
const PLAY_ICON_PATH = '/icon-512.png';
const MODEL_EVAL_ASSETS = join(ROOT, 'scrapbook', 'model-eval', 'prompt-adherence', 'assets');

// Every repo file a composition can name, and nothing else: the documents cannot reach outside it.
export function storeFrameFiles() {
  const files = {
    ...quicksandFiles(),
    [LOGO_PATH]: join(ROOT, 'assets', 'static', 'web-app-manifest-192x192.png'),
    [AI_BEFORE_PATH]: join(MODEL_EVAL_ASSETS, 'in__line__house-sun__wide.jpg'),
    [AI_AFTER_PATH]: join(MODEL_EVAL_ASSETS, 'line__house-sun__wide__overlay-rich__1.jpg'),
    [PLAY_ICON_PATH]: join(ROOT, 'store-assets', 'icon-512.png'),
  };
  for (const target of STORE_TARGETS)
    for (const page of STORE_PAGES.filter(pageHasCapture))
      files[capturePath(target.name, page.id)] = storeCaptureFile(target.name, page.id);
  return files;
}

const WAND_SVG = readFileSync(join(ROOT, 'assets', 'icons', 'wand-stars.svg'), 'utf8');

const ROOT_TOKENS = [
  `--font-family:${scale.fontFamily}`,
  `--radius-pill:${scale.radiusPill}`,
  `--polaroid-paper:${scale.polaroidPaper}`,
  `--polaroid-ink:${scale.polaroidInk}`,
].join(';');

// Store art renders identically whatever theme the rendering browser is in, so every color here is
// the design handoff's fixed value rather than a theme token.
const FRAME_CSS = `.page{position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-family)}
.mark{position:absolute;z-index:1;display:block}
.mark svg{display:block;width:100%;height:auto}
.copy{position:absolute;z-index:2;display:flex;flex-direction:column;align-items:flex-start;justify-content:center}
.copy.centered{align-items:center;text-align:center}
.logo{display:flex;align-items:center;gap:var(--logo-gap);margin-bottom:var(--logo-margin-bottom)}
.logo img{width:var(--logo-icon);height:var(--logo-icon);border-radius:var(--logo-radius)}
.logo span{font-size:var(--logo-text);font-weight:700;color:var(--ink-light-page);letter-spacing:-0.5px}
h1{font-size:var(--headline);font-weight:700;line-height:var(--headline-line-height);letter-spacing:var(--headline-letter-spacing);color:var(--ink);text-wrap:balance}
.sub{margin-top:var(--sub-margin-top);font-size:var(--sub-size);font-weight:600;line-height:var(--sub-line-height);color:var(--ink-muted);text-wrap:balance}
.chips{margin-top:var(--chips-margin-top);display:flex;flex-wrap:wrap;justify-content:center;gap:var(--chip-gap)}
.chip{display:inline-flex;align-items:center;gap:var(--chip-label-gap);background:#fff;border-radius:var(--radius-pill);padding:var(--chip-pad);font-size:var(--chip-font);font-weight:600;color:var(--ink-light-page);box-shadow:var(--chip-shadow)}
.chip i{width:var(--chip-dot);height:var(--chip-dot);border-radius:50%}
.frame{position:absolute;z-index:3;left:var(--frame-x);top:var(--frame-y);width:var(--frame-w);height:var(--frame-h);border-radius:var(--frame-radius);box-shadow:var(--frame-shadow)}
.showcase{position:absolute;inset:0}
.doodle{position:absolute;z-index:3;transform:rotate(-2deg);border-radius:var(--doodle-radius);box-shadow:var(--frame-shadow)}
.wand{position:absolute;z-index:4}
.wand svg{display:block;width:100%;height:auto}
.polaroid{position:absolute;z-index:3;transform:rotate(3deg);background:var(--polaroid-paper);padding:var(--polaroid-pad) var(--polaroid-pad) 0;border-radius:var(--polaroid-radius);box-shadow:var(--frame-shadow)}
.polaroid img{display:block;width:100%;border-radius:var(--polaroid-img-radius)}
.polaroid-caption{text-align:center;font-size:var(--caption-size);font-weight:600;color:var(--polaroid-ink);padding:var(--caption-pad-top) 0 var(--caption-pad-bottom)}`;

const GRAPHIC_CSS = `.graphic{position:relative;overflow:hidden;display:flex;align-items:center;gap:54px;padding:0 86px;font-family:var(--font-family);background:radial-gradient(circle at 20% 20%, #fff 0%, #fdf7ff 45%, #f3f0ff 100%)}
.dots{position:absolute;inset:0}
.dot{position:absolute;border-radius:50%;opacity:0.85}
.icon{width:300px;height:300px;flex:0 0 auto;filter:drop-shadow(0 14px 30px rgb(120 80 180 / 25%))}
.copy{z-index:2}
.name{font-size:128px;font-weight:700;letter-spacing:-2px;background:var(--name-gradient);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
.tag{font-size:38px;font-weight:600;color:#5a4a6b;margin-top:18px}
.sub{font-size:24px;font-weight:500;color:#9385a3;margin-top:14px}`;

function documentShell(title, css, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${QUICKSAND_STYLESHEET}">
<style>${DOCUMENT_RESET_CSS}
:root{${ROOT_TOKENS}}
.surface{position:absolute;top:0;left:0}
${css}</style>
</head>
<body><div class="surface">${body}</div></body>
</html>
`;
}

function pageVariables(target, page, geo) {
  const px = (value) => `${Math.round(value * geo.k)}px`;
  const type = TYPE_SPEC[geo.orientation];
  const shadow = FRAME_SHADOW_SPEC[geo.orientation][page.dark ? 'dark' : 'light'];
  return [
    `width:${target.width}px`,
    `height:${target.height}px`,
    `--bg:${page.dark ? DARK_BG : LIGHT_BG}`,
    `--ink:${page.dark ? INK_ON_DARK : INK}`,
    `--ink-light-page:${INK}`,
    `--ink-muted:${page.dark ? INK_MUTED_ON_DARK : INK_MUTED}`,
    `--frame-shadow:0 ${px(shadow.y)} ${px(shadow.blur)} ${shadow.color}`,
    `--logo-gap:${px(type.logoGap)}`,
    `--logo-margin-bottom:${px(type.logoMarginBottom)}`,
    `--logo-icon:${px(type.logoIcon)}`,
    `--logo-radius:${px(type.logoRadius)}`,
    `--logo-text:${px(type.logoText)}`,
    `--headline:${px(type.headline)}`,
    `--headline-line-height:${type.headlineLineHeight}`,
    `--headline-letter-spacing:${(type.letterSpacing * geo.k).toFixed(2)}px`,
    `--sub-size:${px(type.sub)}`,
    `--sub-line-height:${type.subLineHeight}`,
    `--sub-margin-top:${px(type.subMarginTop)}`,
    `--chips-margin-top:${px(CHIP_SPEC.marginTop)}`,
    `--chip-gap:${px(CHIP_SPEC.gap)}`,
    `--chip-label-gap:${px(CHIP_SPEC.labelGap)}`,
    `--chip-pad:${px(CHIP_SPEC.padY)} ${px(CHIP_SPEC.padX)}`,
    `--chip-font:${px(CHIP_SPEC.font)}`,
    `--chip-dot:${px(CHIP_SPEC.dot)}`,
    `--chip-shadow:0 ${px(CHIP_SPEC.shadowY)} ${px(CHIP_SPEC.shadowBlur)} rgb(60 40 110 / 10%)`,
    `--frame-x:${geo.frame.x}px`,
    `--frame-y:${geo.frame.y}px`,
    `--frame-w:${geo.frame.width}px`,
    `--frame-h:${geo.frame.height}px`,
    `--frame-radius:${px(FRAME_RADIUS[geo.orientation])}`,
  ].join(';');
}

// Landscape mark Y scales with frame HEIGHT, not width: the copy column is vertically centered, so
// on the taller 4:3 iPad a width-scaled bottom mark would land inside the copy block instead of the
// bottom whitespace. On the 16:9 base the two scales are identical.
function pageMarks(target, page, geo) {
  const yScale = geo.orientation === 'landscape' ? target.height / L_BASE_H : geo.k;
  return marksFor(page.id, geo.orientation)
    .map((mark) => {
      const x = Math.round(mark.x * geo.k);
      const yFromTop = Math.round(mark.y * yScale);
      const y = mark.fromBottom ? target.height - yFromTop : yFromTop;
      if (mark.kind === 'dot') {
        const d = Math.round(mark.d * geo.k);
        return `<span class="mark" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;border-radius:50%;background:${mark.color}"></span>`;
      }
      const width = Math.round(MARK_BASE_W[mark.kind] * mark.scale * geo.k);
      return `<span class="mark" style="left:${x}px;top:${y}px;width:${width}px;transform:rotate(${mark.rot}deg)">${MARKS[mark.kind](mark.color)}</span>`;
    })
    .join('');
}

function pageCopy(page, geo) {
  const placement =
    geo.orientation === 'portrait'
      ? `left:${geo.copy.x}px;top:${geo.copy.top}px;width:${geo.copy.width}px;height:${geo.copy.height}px`
      : `left:${geo.copy.x}px;top:0;bottom:0;width:${geo.copy.width}px`;
  const logo = page.logo
    ? `<div class="logo"><img src="${LOGO_PATH}" alt=""><span>Splotch</span></div>`
    : '';
  const chips = page.chips
    ? `<div class="chips">${page.chips
        .map(
          (chip) =>
            `<span class="chip"><i style="background:${chip.color}"></i>${escapeHtml(chip.label)}</span>`
        )
        .join('')}</div>`
    : '';
  // The title is first-party markup from pages.ts, where it may carry an explicit <br>.
  return `<div class="copy${geo.orientation === 'portrait' ? ' centered' : ''}" style="${placement}">${logo}<h1>${page.title}</h1><p class="sub">${escapeHtml(page.sub)}</p>${chips}</div>`;
}

// Page 04's doodle → masterpiece showcase. Landscape is authored at 16:9; on the taller 4:3 iPad
// the width-scaled composition would sit top-heavy, so it re-centers in the extra height, the same
// reasoning as the landscape marks' height-scaled Y.
function showcaseScene(target, geo) {
  const { k } = geo;
  const spec = SHOWCASE_SPEC[geo.orientation];
  const card = SHOWCASE_CARD_SPEC[geo.orientation];
  const v =
    geo.orientation === 'portrait' ? Math.min(1, target.height / k / P_SHOWCASE_DESIGN_H) : 1;
  const yOffset =
    geo.orientation === 'landscape' ? Math.round((target.height - L_BASE_H * k) / 2) : 0;
  const sx = (x) => Math.round(k * (x * v + (P_BASE_W / 2) * (1 - v)));
  const sy = (y) => Math.round(y * v * k) + yOffset;
  const sw = (w) => Math.round(w * v * k);
  const px = (value) => `${Math.round(value * k)}px`;
  const place = (p) => `left:${sx(p.x)}px;top:${sy(p.y)}px;width:${sw(p.w)}px`;
  const cardVars = [
    `--doodle-radius:${px(card.doodleRadius)}`,
    `--polaroid-radius:${px(card.polaroidRadius)}`,
    `--polaroid-pad:${px(card.pad)}`,
    `--polaroid-img-radius:${px(4)}`,
    `--caption-size:${px(card.caption)}`,
    `--caption-pad-top:${px(card.captionPad[0])}`,
    `--caption-pad-bottom:${px(card.captionPad[1])}`,
  ].join(';');
  const stones = spec.stones
    .map(
      (stone) =>
        `<span class="mark" style="left:${sx(stone.x)}px;top:${sy(stone.y)}px;width:${sw(stone.d)}px;height:${sw(stone.d)}px;border-radius:50%;background:${paletteHex(stone.color)}"></span>`
    )
    .join('');
  const sparkles = spec.sparkles
    .map(
      (sparkle) =>
        `<span class="mark" style="${place(sparkle)}">${MARKS.sparkle(paletteHex(sparkle.color))}</span>`
    )
    .join('');
  return `<div class="showcase" style="${cardVars}"><img class="doodle" style="${place(spec.doodle)}" src="${AI_BEFORE_PATH}" alt="">${stones}<div class="wand" style="${place(spec.wand)}">${WAND_SVG}</div>${sparkles}<div class="polaroid" style="${place(spec.polaroid)}"><img src="${AI_AFTER_PATH}" alt=""><div class="polaroid-caption">AI-generated picture</div></div></div>`;
}

// One marketing page framed for one store slot, at the slot's pixel size.
export function storeFrameDocument(targetName, pageId) {
  const target = STORE_TARGETS.find((entry) => entry.name === targetName);
  if (!target) throw new Error(`Unknown store target ${JSON.stringify(targetName)}`);
  const page = STORE_PAGES.find((entry) => entry.id === pageId);
  if (!page) throw new Error(`Unknown store page ${JSON.stringify(pageId)}`);
  const geo = frameGeometry(target);
  const subject = page.showcase
    ? showcaseScene(target, geo)
    : `<img class="frame" src="${capturePath(target.name, page.id)}" alt="">`;
  return documentShell(
    `Store frame ${page.id} · ${target.name}`,
    FRAME_CSS,
    `<div class="page" style="${pageVariables(target, page, geo)}">${pageMarks(target, page, geo)}${pageCopy(page, geo)}${subject}</div>`
  );
}

const RAINBOW_GRADIENT = `linear-gradient(90deg,${['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'].map(paletteHex).join(',')})`;

const FEATURE_DOTS = [
  { size: 42, color: paletteHex('Yellow'), style: 'top:48px;left:560px' },
  { size: 26, color: paletteHex('Green'), style: 'top:120px;left:930px' },
  { size: 34, color: paletteHex('Blue'), style: 'bottom:70px;left:520px' },
  { size: 20, color: paletteHex('Red'), style: 'bottom:120px;left:880px' },
  { size: 30, color: paletteHex('Purple'), style: 'top:60px;left:60px' },
];

// Google Play's 1024×500 feature graphic, which takes no device target.
export function featureGraphicDocument() {
  const dots = FEATURE_DOTS.map(
    (dot) =>
      `<span class="dot" style="width:${dot.size}px;height:${dot.size}px;background:${dot.color};${dot.style}"></span>`
  ).join('');
  return documentShell(
    'Play feature graphic',
    GRAPHIC_CSS,
    `<div class="graphic" style="width:${FEATURE_GRAPHIC.width}px;height:${FEATURE_GRAPHIC.height}px;--name-gradient:${RAINBOW_GRADIENT}"><div class="dots">${dots}</div><img class="icon" src="${PLAY_ICON_PATH}" alt=""><div class="copy"><div class="name">Splotch</div><div class="tag">Doodle, color &amp; create</div><div class="sub">A calm, ad-free drawing app made for little hands</div></div></div>`
  );
}
