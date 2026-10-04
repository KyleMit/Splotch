// Regenerates web/static/large-image.png by replaying the SVG drawing instructions
// in tools/marketing-assets/assets/promotional-image.svg onto the live Splotch canvas.
// The output is 1920x1080 (16:9 landscape, same as Google Play tablet spec).
//
// This PNG is also the social/link-preview image: app.html points og:image and
// twitter:image at /large-image.png. If you change the output dimensions here,
// update og:image:width / og:image:height in web/src/app.html to match (an E2E
// test in web/tests/page.spec.ts asserts the two agree), then re-scrape via the
// Facebook Sharing Debugger since scrapers cache the old card for weeks.
//
// The run always starts this checkout's own dev server, never reusing one: on 4173,
// or on an OS-assigned port when 4173 is taken.
//   npm run gen:promotional-image

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, ROOT } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { circlePts } from '../app-driver/lib/stroke-geometry.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickDrawingColor,
  setStrokeSize,
  drawStroke,
  dismissMenu,
} from '../app-driver/lib/app-driver.mjs';

const SVG_FILE = join(ROOT, 'tools', 'marketing-assets', 'assets', 'promotional-image.svg');
const OUT = join(ROOT, 'web', 'static', 'large-image.png');
const PORT = 4173;

// 1280x720 @ 1.5x = 1920x1080 screenshot
const DEVICE = { width: 1280, height: 720, deviceScaleFactor: 1.5 };

// The palette swatch nearest each SVG stroke colour
const COLOR_MAP = {
  '#86aed3': 'Blue',
  '#95c274': 'Green',
  '#b57cd0': 'Purple',
  '#dd6158': 'Red',
  '#e79255': 'Orange',
  '#e8cf77': 'Yellow',
};

// Every element the replay understands, with each attribute it reads or can safely
// ignore. Anything else (a transform, a style, opacity, another element) changes the
// drawing in a way the replay cannot reproduce, so it fails the parse instead.
const ELEMENT_ATTRIBUTES = {
  svg: ['xmlns', 'version', 'viewBox'],
  g: ['fill', 'stroke-linecap', 'stroke-linejoin', 'vector-effect'],
  path: ['d', 'stroke', 'stroke-width'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
};
const TAG = /<[^>]*>/g;
const CLOSING_TAG = /^<\/(?:svg|g)>$/;
// ATTRIBUTE reads only double-quoted values, so ELEMENT_TAG refuses a tag spelled any
// other way rather than letting its attributes go unread.
const ELEMENT_TAG = /^<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>$/;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;
const ZERO_ORIGIN_VIEWBOX = /^0 0 (\S+) (\S+)$/;

// SVG stroke width → app stroke size. Each size's pen width is STROKE_WIDTHS in
// tools/store-drawings/gen-pointer-instructions.mjs, drift-guarded against the app.
function svgWidthToAppSize(w) {
  if (w <= 9) return 2; // SVG 8   → size 2
  if (w <= 14) return 3; // SVG 14  → size 3
  return 4; // SVG 15+ → size 4
}

// Number('') is 0, so a blank value is refused before the conversion can accept it.
function svgNumber(text, context) {
  const value = text?.trim() ? Number(text) : Number.NaN;
  if (!Number.isFinite(value)) throw new Error(`${context} is not a number: ${text}`);
  return value;
}

// One replayed stroke is one pointer path, so a path must be a single absolute,
// space-separated polyline: 'M x y' and then only 'L x y'.
function parsePath(d) {
  const tokens = d.trim().split(/\s+/);
  const pts = [];
  for (let i = 0; i < tokens.length; i += 3) {
    const expected = i === 0 ? 'M' : 'L';
    if (tokens[i] !== expected) {
      throw new Error(`Unsupported path token ${tokens[i]} (expected ${expected}) in d="${d}"`);
    }
    pts.push({
      x: svgNumber(tokens[i + 1], `${expected} x in d="${d}"`),
      y: svgNumber(tokens[i + 2], `${expected} y in d="${d}"`),
    });
  }
  return pts;
}

function parseAttributes(element, source) {
  const allowed = ELEMENT_ATTRIBUTES[element];
  if (!allowed) throw new Error(`Unsupported SVG element <${element}>`);
  const attributes = {};
  for (const [, name, value] of source.matchAll(ATTRIBUTE)) {
    if (!allowed.includes(name)) throw new Error(`Unsupported attribute ${name} on <${element}>`);
    attributes[name] = value;
  }
  return attributes;
}

function parseViewBox(viewBox) {
  const match = viewBox?.match(ZERO_ORIGIN_VIEWBOX);
  if (!match) throw new Error(`<svg> needs a viewBox of "0 0 <width> <height>", got ${viewBox}`);
  return {
    width: svgNumber(match[1], 'viewBox width'),
    height: svgNumber(match[2], 'viewBox height'),
  };
}

function parseStroke(element, attributes) {
  const read = (name) => {
    if (attributes[name] === undefined) throw new Error(`<${element}> is missing ${name}`);
    return attributes[name];
  };
  const number = (name) => svgNumber(read(name), `<${element}> ${name}`);
  const label = COLOR_MAP[read('stroke')];
  if (!label) throw new Error(`Unmapped stroke color ${attributes.stroke} on <${element}>`);
  const pts =
    element === 'path' ? parsePath(read('d')) : circlePts(number('cx'), number('cy'), number('r'));
  return { label, strokeWidth: number('stroke-width'), pts };
}

// Every drawable element as { label, strokeWidth, pts }, with the viewBox size its
// points are measured in. Markup the replay would drop or misdraw throws instead.
export function parseSvg(text) {
  if (text.replace(TAG, '').trim()) throw new Error('Unexpected text outside SVG tags');
  let viewBox;
  const strokes = [];
  for (const [tag] of text.matchAll(TAG)) {
    if (CLOSING_TAG.test(tag)) continue;
    const match = tag.match(ELEMENT_TAG);
    if (!match) throw new Error(`Unsupported SVG markup ${tag}`);
    const [, element, attributeSource, selfClosing] = match;
    const attributes = parseAttributes(element, attributeSource);
    if (element === 'svg') {
      if (viewBox) throw new Error('Nested <svg> is unsupported');
      viewBox = parseViewBox(attributes.viewBox);
    } else if (element !== 'g') {
      if (!selfClosing) throw new Error(`<${element}> must be self-closing`);
      strokes.push(parseStroke(element, attributes));
    }
  }
  if (!viewBox) throw new Error('No <svg> root');
  if (strokes.length === 0) throw new Error('SVG has no strokes to replay');
  return { ...viewBox, strokes };
}

export async function generatePromotionalImage() {
  const svg = parseSvg(readFileSync(SVG_FILE, 'utf8'));
  console.log(`Parsed ${svg.strokes.length} drawing elements.`);

  const { base, stop } = await ensureDevServer(PORT);
  try {
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
    const { ctx, page } = await openAppPage(browser, base, DEVICE);
    await expandDrawer(page);

    const box = await canvasBox(page);
    console.log(`Canvas: ${box.width}×${box.height} at (${box.x}, ${box.y})`);
    const sx = box.width / svg.width;
    const sy = box.height / svg.height;

    let currentLabel = null;
    let currentSize = null;
    for (const s of svg.strokes) {
      const appSize = svgWidthToAppSize(s.strokeWidth);
      const pts = s.pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));

      if (appSize !== currentSize) {
        await setStrokeSize(page, appSize);
        currentSize = appSize;
      }
      if (s.label !== currentLabel) {
        await pickDrawingColor(page, { kind: 'palette', label: s.label });
        currentLabel = s.label;
      }
      await drawStroke(page, box, pts);
    }

    await dismissMenu(page);
    await page.screenshot({ path: OUT });
    console.log(`Saved: ${OUT}`);

    await ctx.close();
    await browser.close();
  } finally {
    stop();
  }
  console.log('Done.');
}

if (isMain(import.meta.url)) await generatePromotionalImage();
