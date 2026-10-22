// The standalone pages' link-preview card as a self-contained document: the crayon band, the
// Splotchy mark and wordmark, and the page name over the handmade paper, in the light theme's
// tokens whatever the rendering browser prefers. gen-share-cards.mjs screenshots it.
import { join } from 'node:path';
import { PAGE_SHARE_CARDS, SHARE_CARD_SIZE, isPageShareCardPath } from './page/socialCard.ts';
import { scale, themes } from '../../../src/lib/design/tokens.ts';
import { paletteHex } from '../../../src/lib/palette.ts';
import { ROOT } from '../../lib/proc.mjs';
import {
  DOCUMENT_RESET_CSS,
  QUICKSAND_STYLESHEET,
  escapeHtml,
  quicksandFiles,
} from './static-document.mjs';

const BAND_HEIGHT_PX = 30;
const BAND_GAP_PX = 4;
const CONTENT_GUTTER_PX = 75;
const CONTENT_TOP_GAP_PX = 52;
const CONTENT_BOTTOM_PX = 60;
const MARK_SIZE_PX = 104;
const BRAND_GAP_PX = 24;
const WORDMARK_FONT_PX = 44;
const TITLE_FONT_PX = 120;
const HIGHLIGHT_HEIGHT_PX = 44;
const HIGHLIGHT_BOTTOM_PX = 14;
const HIGHLIGHT_LEFT_PX = 14;
const HIGHLIGHT_RIGHT_PX = 28;

// The brand crayon strip in rainbow order, not palette.ts's trim order: the same strip the
// scrapbook masthead and the app's CrayonStrip draw.
const CRAYON_LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];

export const SHARE_CARD_WEIGHTS = [700];

const PAPER_PATH = '/assets/handmade-paper.webp';
const MARK_PATH = '/assets/splotchy.svg';

export const SHARE_CARD_FILES = {
  ...quicksandFiles(),
  [PAPER_PATH]: join(ROOT, 'assets/paper/handmade-paper.webp'),
  [MARK_PATH]: join(ROOT, 'assets/icons/splotchy.svg'),
};

const STYLES = `${DOCUMENT_RESET_CSS}
.share-card{position:absolute;top:0;left:0;overflow:hidden;background:var(--card-paper);color:var(--card-strong);font-family:var(--card-font)}
.paper{position:absolute;inset:0;background-repeat:repeat}
.band{position:relative;line-height:0}
.crayons{display:inline-flex;gap:var(--crayon-gap);flex:0 0 auto}
.crayons i{display:block;width:var(--crayon-width);height:var(--crayon-height);border-radius:999px}
.content{position:absolute;inset:var(--card-top) var(--card-gutter) var(--card-bottom);display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:var(--card-brand-gap);color:var(--card-text);font-size:var(--card-wordmark-font);font-weight:700;letter-spacing:0.14em}
.mark{display:inline-flex;line-height:0;width:var(--card-mark);height:var(--card-mark)}
.mark img{width:100%;height:100%;display:block}
h1{margin:0;font-size:var(--card-title-font);font-weight:700;line-height:1.05;letter-spacing:-0.015em;text-wrap:balance}
h1 span{position:relative;isolation:isolate}
h1 span::before{content:'';position:absolute;z-index:-1;left:var(--card-highlight-left);right:var(--card-highlight-right);bottom:var(--card-highlight-bottom);height:var(--card-highlight-height);border-radius:999px;background:var(--card-yellow);opacity:0.7;transform:rotate(-1.5deg)}`;

function cardStyle({ width, height }) {
  const light = themes.light;
  return [
    `width:${width}px`,
    `height:${height}px`,
    `--card-paper:${light.paper}`,
    `--card-text:${light.text}`,
    `--card-strong:${light.textStrong}`,
    `--card-font:${scale.fontFamily}`,
    `--card-yellow:${paletteHex('Yellow')}`,
    `--card-gutter:${CONTENT_GUTTER_PX}px`,
    `--card-top:${BAND_HEIGHT_PX + CONTENT_TOP_GAP_PX}px`,
    `--card-bottom:${CONTENT_BOTTOM_PX}px`,
    `--card-mark:${MARK_SIZE_PX}px`,
    `--card-brand-gap:${BRAND_GAP_PX}px`,
    `--card-wordmark-font:${WORDMARK_FONT_PX}px`,
    `--card-title-font:${TITLE_FONT_PX}px`,
    `--card-highlight-height:${HIGHLIGHT_HEIGHT_PX}px`,
    `--card-highlight-bottom:${HIGHLIGHT_BOTTOM_PX}px`,
    `--card-highlight-left:-${HIGHLIGHT_LEFT_PX}px`,
    `--card-highlight-right:-${HIGHLIGHT_RIGHT_PX}px`,
  ].join(';');
}

function crayonBand(width) {
  const crayonWidth = (width - (CRAYON_LABELS.length - 1) * BAND_GAP_PX) / CRAYON_LABELS.length;
  const crayons = CRAYON_LABELS.map((label) => `<i style="background:${paletteHex(label)}"></i>`);
  return `<div class="band" style="--crayon-width:${crayonWidth}px;--crayon-height:${BAND_HEIGHT_PX}px;--crayon-gap:${BAND_GAP_PX}px"><span class="crayons" aria-hidden="true">${crayons.join('')}</span></div>`;
}

// Runs in the rendered document: what a crawler's screenshot of it would hold.
export function readShareCard() {
  const card = document.querySelector('.share-card')?.getBoundingClientRect();
  return {
    title: document.querySelector('h1')?.textContent ?? null,
    card: card ? { x: card.x, y: card.y, width: card.width, height: card.height } : null,
    page: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
  };
}

// The card fills the screenshot exactly and names its page: a card that overflowed the 1200×630
// clip, or fell short of it, would crop or pad the image every link preview shows.
export function shareCardProblems(card, read) {
  const problems = [];
  if (read.title !== card.name)
    problems.push(`headed ${JSON.stringify(read.title)}, not ${card.name}`);
  const bounds = { x: 0, y: 0, ...SHARE_CARD_SIZE };
  if (JSON.stringify(read.card) !== JSON.stringify(bounds))
    problems.push(`card box ${JSON.stringify(read.card)}, not ${JSON.stringify(bounds)}`);
  if (read.page.width !== SHARE_CARD_SIZE.width || read.page.height !== SHARE_CARD_SIZE.height)
    problems.push(`document is ${read.page.width}×${read.page.height}`);
  return problems;
}

// The card for one standalone page's path; any other path throws, so a typo cannot render a card
// for a page that has none.
export function shareCardDocument(path) {
  if (!isPageShareCardPath(path)) throw new Error(`No share card for ${JSON.stringify(path)}`);
  const card = PAGE_SHARE_CARDS[path];
  const { width } = SHARE_CARD_SIZE;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${escapeHtml(card.alt)} share card</title>
<link rel="stylesheet" href="${QUICKSAND_STYLESHEET}">
<style>${STYLES}</style>
</head>
<body>
<article class="share-card" aria-label="${escapeHtml(card.alt)}" style="${cardStyle(SHARE_CARD_SIZE)}">
<div class="paper" style="background-image:url('${PAPER_PATH}')"></div>
${crayonBand(width)}
<div class="content"><div class="brand"><span class="mark"><img src="${MARK_PATH}" alt=""></span><span>SPLOTCH</span></div><h1><span>${escapeHtml(card.name)}</span></h1></div>
</article>
</body>
</html>
`;
}
