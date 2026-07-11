// EXPERIMENT (not shipped): generate a DARK-THEME colored fill for coloring
// pages — the counterpart to gen-coloring-fills.mjs's light fills. Instead of
// black lines on white filled with pastels, the source is inverted to WHITE
// lines on a dark background and Gemini fills the regions with vivid colors that
// glow against the dark (a "night / neon" coloring), so dark mode can show a
// whole separate set of renders rather than forcing a light sheet.
//
// The model sometimes DRIFTS — inventing a shape the line art doesn't have (an
// extra star, a stray dot). Because a night fill's WHITE pixels are outlines only
// (fills are saturated, background is deep navy), any white/low-chroma pixel that
// lands far from a source outline is an invented outline. scoreDrift() counts
// those; a render above the threshold is regenerated (bumping temperature) up to
// --max-attempts times, keeping the least-drifted take. Clean fills score ~0.
//
// Three automated gates run per take, each with keep-best-of-N retry: scoreDrift()
// (invented outlines), scoreNightness() (a bright/daytime background), and
// scoreLineColor() (the model re-inked the white outlines DARK — they must stay
// white so they sit under the app's white "chalk" line art in dark mode).
//
// Full workflow (generate → review contact sheet → ship → wire → verify), the prompt
// lessons, and the remaining-category checklist: tools/asset-gen/night-fills.md.
//
// Requires GEMINI_API_KEY. Writes candidates to .coloring-samples-dark/ for
// review — it does NOT touch the shipped assets.
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space               whole category
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space/astronaut-tall one page
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --tall         portrait pages only
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --wide         landscape pages only
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --samples 2    2 takes each
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --max-attempts 4  retry harder
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --line-white-min 150  dark-outline gate
//   node tools/asset-gen/gen-coloring-fills-dark.mjs space --dilate-lines 2  thicken white input lines
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, FILL_SRC_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
import { alignToSource } from './lib/align-to-source.mjs';
import { scoreEyeFill, judgeNightEyes } from './lib/eye-fill.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

// --- Drift detection ----------------------------------------------------------
// A night fill's white pixels are outlines; the model has drifted when it draws a
// white outline where the source line art has none. We rasterize both at a working
// width, mark the source's outline pixels (dark in the black-on-white source),
// dilate that mask to absorb registration slack + the fill's glow, then count
// fill white/low-chroma pixels that fall outside it. Normalized by the source
// outline mass so pages of different line density compare on one scale.
const DRIFT_W = 512; // working width for the comparison
const DRIFT_SRC_DARK = 110; // source pixel darker than this = a line
const DRIFT_DILATE = 6; // px of slack around each source line (registration + glow)
const DRIFT_THIN = 3; // white strokes up to ~2*this px wide are outline-like, not fills
const DRIFT_LUMA_WHITE = 185; // fill pixel this bright...
const DRIFT_CHROMA_MAX = 45; // ...and this desaturated = a white outline, not a fill
// Above this share of invented white (relative to source outline mass) a render is
// regenerated. Clean fills score 0; a stray invented shape lands well above this.
const DRIFT_THRESHOLD_DEFAULT = 0.004;

// Separable box morphology of a 0/1 mask. dilate = a pixel is set if ANY neighbor
// within r is set; erode = set only if ALL neighbors within r are set.
function morph(mask, w, h, r, dilate) {
  const hit = dilate ? 1 : 0; // dilate stops on the first set; erode stops on first unset
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = dilate ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const v = xx < 0 || xx >= w ? 0 : mask[y * w + xx];
        if (v === hit) {
          on = hit;
          break;
        }
      }
      tmp[y * w + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = dilate ? 0 : 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        const v = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
        if (v === hit) {
          on = hit;
          break;
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}
const dilateMask = (mask, w, h, r) => morph(mask, w, h, r, true);
const erodeMask = (mask, w, h, r) => morph(mask, w, h, r, false);

// --- Night-ness detection -----------------------------------------------------
// The model also drifts on MOOD — painting a bright daytime "sky blue" (or white)
// background instead of a night sky. The TRUE background (the open area outside
// every shape, flood-filled from the border through the source's white) must be a
// deep evening tone. We report its MEDIAN luma — robust to a bright edge-touching
// shape (ground, planet) leaking into the fill — so a genuinely dark night sky
// stays low even then, while a daytime sky reads bright. Known-good night fills
// sit at ~15-32; sky-blue daytime is ~150+.
const NIGHT_W = 384;
const NIGHT_SRC_LIGHT = 170; // source pixel brighter than this = background candidate
const NIGHT_BG_LUMA_MAX_DEFAULT = 100; // median background luma above this = too bright / daytime
const NIGHT_MIN_BG_FRAC = 0.04; // skip the check if there's barely any open background

async function scoreNightness(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && s.data[i] > NIGHT_SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  // Too little open background to judge (e.g. a full-bleed subject): treat as fine.
  if (lumas.length < n * NIGHT_MIN_BG_FRAC) return { bgLuma: 0, bgFrac: lumas.length / n };
  lumas.sort((a, b) => a - b);
  return { bgLuma: lumas[lumas.length >> 1], bgFrac: lumas.length / n };
}

async function scoreDrift(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const outline = new Uint8Array(n);
  let srcCount = 0;
  for (let i = 0; i < n; i++) {
    if (s.data[i] < DRIFT_SRC_DARK) {
      outline[i] = 1;
      srcCount++;
    }
  }
  const allowed = dilateMask(outline, w, h, DRIFT_DILATE);

  // Bright, desaturated pixels in the fill — outlines AND any pale/white fill
  // (a moonlit face, a water droplet). We only want INVENTED OUTLINES, so keep the
  // THIN white and drop the thick blobs: an erode-then-dilate (opening) preserves
  // fill blobs; whatever the opening removes was a thin stroke. An invented shape's
  // outline survives; a legit pale fill region does not, so pale-subject pages
  // aren't false-flagged as drift.
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w, h, DRIFT_THIN), w, h, DRIFT_THIN);
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (white[i] && !blobs[i] && !allowed[i]) added++; // thin white, far from a source line
  }
  return { ratio: srcCount ? added / srcCount : 0, added, srcCount };
}

// --- Line-color detection -----------------------------------------------------
// The fill's outlines must stay WHITE — in dark mode they sit under the app's
// white "chalk" line art, so a fill whose outlines came back DARK (the model
// re-inked every shape with a black/brown stroke instead of keeping them white)
// doubles against the chalk and reads wrong. The source (black-on-white) says
// exactly WHERE the outlines are; at each, a good fill has a bright WHITE line and
// a dark-lined fill has only dark ink. Per source-outline pixel we take the
// brightest fill luma within 1px (absorbing a pixel of registration slack) and
// report the MEDIAN. Calibrated on a labeled Farm batch: fully dark-lined fills
// read ~65-135, white-lined ~154-250. Reject below --line-white-min (default 150,
// the highest cut that still clears the good set's floor). A pale, patchy subject
// (a mostly-white dog with a few dark contours) is the hard case — it can land near
// the boundary, so a flagged page may need a targeted low-temp regen to come back
// cleanly white; eyeball borderline pages in the contact sheet.
const LINE_W = 512;
const LINE_SRC_DARK = 110; // source pixel darker than this = an outline
const LINE_WHITE_MIN_DEFAULT = 150; // median outline brightness below this = dark outlines

async function scoreLineColor(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= LINE_SRC_DARK) continue; // not a source outline pixel
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = t.data[yy * w + xx];
          if (v > mx) mx = v;
        }
      }
      maxes.push(mx);
    }
  }
  if (!maxes.length) return { lineWhite: 255 };
  maxes.sort((a, b) => a - b);
  return { lineWhite: maxes[maxes.length >> 1] };
}

const MODEL = 'gemini-2.5-flash-image';
const OUT_DIR = SAMPLES_DARK_DIR;
const WEBP_QUALITY = 90;

// The input handed to the model is the inverted line art: WHITE outlines on a
// near-black ground. The prompt asks it to keep those white lines and fill the
// regions with colors that read on dark — the "answer key" for a dark theme.
const DARK_FILL_PROMPT = `You are given a toddler coloring-book page drawn as WHITE outlines on a dark background. Color it in as a cozy NIGHT-TIME / EVENING scene — as if the whole picture is happening at dusk or after dark, softly lit by moonlight.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every WHITE outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The outlines must stay white and pixel-for-pixel identical to the original.
- THE OUTLINES ARE WHITE AND MUST STAY BRIGHT WHITE. This is a white-line drawing on a dark ground, NOT a normal black-outline coloring page. NEVER turn the outlines black, dark, grey, brown, or any dark color. NEVER trace, re-ink, or redraw the shapes with dark or black lines. Every outline that is white in the input must still be a bright white line in your output. A picture with dark outlines is WRONG and unusable — the lines must glow white against the dark fills.
- Do not add any new lines, outlines, stars, dots, details, decorations, patterns, textures, letters, or objects. Only add color to the regions that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

THIS IS A NIGHT / EVENING SCENE — the whole point:
- The picture must clearly read as taking place at NIGHT or in the EVENING — dusk, twilight, moonlit, after dark — NOT in bright daylight. A daytime subject (a sunny leaf, a blue-sky day) must simply look like it is now night-time.
- The BACKGROUND and every large open or empty area must be a DEEP EVENING-SKY tone: midnight blue, deep indigo, dark twilight purple, or deep navy. It does NOT have to be pitch black — a deep dusk is fine — but it must be DARK and DIM.
- Do NOT paint the background a bright or light "SKY BLUE" / daytime blue, and do NOT make it white, grey, or any pale or bright color. When in doubt, go darker and deeper.

COLORING STYLE — a dim, moonlit night palette:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no crayon or paint texture.
- Colors stay deep and moonlit, but they are still the subject's OWN NATURAL colors — just dimmed and cooled by moonlight, not swapped out. A few GLOWING accent colors (warm gold, amber, teal, magenta) can pop as if lit by the moon, fireflies, or a lantern, while the overall scene stays dim and evening-lit — deep, not bright and sunny.
- FACES, SKIN, and ANIMAL BODIES must keep a NATURAL, living color — never grey, ashen, ghostly, chalky, or washed-out slate. Give a person a real SKIN TONE (a warm tan, brown, peach, or golden-brown, only darkened for night); give an animal its real coloring (a green caterpillar, a yellow-and-black bee, a red ladybug), softened toward evening. A face must look like living skin or fur under moonlight, NOT like a pale ghost.
- Only things that have no real color of their own — a cloud, a water droplet, a wisp of steam, a puff of smoke, the glow of a star — may take a soft, dim, moonlit off-white or pale tint. Everything else keeps its own (dimmed) color.
- EYES — FILL EVERY RING: an eye in this drawing is NESTED OUTLINED CIRCLES — an eyeball, a pupil circle inside it, and a tiny catchlight circle inside the pupil. Each circle's inside is a REGION TO FILL like any other region, never a ring left sitting on one flat color. Paint the eyeball's inside a LIGHT OFF-WHITE, the pupil circle's inside a DEEP NEAR-BLACK (very dark brown or near-black navy), and the tiny catchlight circle's inside BRIGHT WHITE. The finished eye must show three clearly different tones — light eyeball, dark pupil, white glint — so it reads as a lively cartoon eye. An eye where the eyeball, pupil, and catchlight all came out the same color (all dark, or all light) is WRONG and unusable — in dark mode YOUR pixels are the eye the child sees.
- Do NOT use pure or bright WHITE fills elsewhere, and avoid bright daytime colors (bright sky blue, bright grass green). Deepen and cool every color toward evening. The only pure-white pixels allowed are the outlines themselves, the eye-whites, and tiny eye glints.
- Keep the WHITE outlines fully visible — every fill should butt right up against the white outline without covering it.

Convey the night mood with COLOR AND MOOD ONLY. Do NOT add a moon, stars, fireflies, lamps, or any new shapes or lines — only the outlines already present may be colored.

The result must look like the identical white-line drawing, recolored as a cozy, dim, moonlit NIGHT-TIME scene on a deep dark evening background — never a bright daytime picture.`;

async function generateDarkPage(ai, { imageBytes, mimeType, temperature }) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(imageBytes).toString('base64') } },
          { text: DARK_FILL_PROMPT },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      ...(temperature === undefined ? {} : { temperature }),
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') throw new Error(`${classified.kind}: ${classified.reason}`);
  return { bytes: Buffer.from(classified.data, 'base64'), mimeType: classified.mimeType };
}

// Grow the WHITE lines by `radius` px with a separable max filter. A pale
// subject (a cream unicorn, a white pegasus) tempts the model to re-ink the
// thin outlines DARK to define the body against its own light fill; a bolder
// white band in the input is far more likely to survive as white (and gives the
// scoreLineColor gate a wider white target to sample). Runs on the negated
// grayscale line art — lossless here, since the source is black on white.
async function dilateWhiteLines(negatedBuf, radius) {
  const { data, info } = await sharp(negatedBuf)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rowMax = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const v = data[row + xx];
        if (v > m) m = v;
      }
      rowMax[row + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const v = rowMax[yy * w + x];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 1 } });
}

// Invert the black-on-white line art to white-on-dark. A plain negate yields
// white lines on pure black; nudge the floor up a touch so it reads as deep
// charcoal rather than absolute black (closer to the app's --paper dark).
// With --dilate-lines N, thicken the white lines first (see dilateWhiteLines).
async function toDarkInput(sourceBuf) {
  const negated = await sharp(sourceBuf).negate({ alpha: false }).toBuffer();
  const grown = dilateLines > 0 ? await dilateWhiteLines(negated, dilateLines) : sharp(negated);
  return grown.webp({ quality: WEBP_QUALITY }).toBuffer();
}

async function pagesUnder(sub = '') {
  const out = [];
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  for await (const entry of glob('**/*-{tall,wide}.outline.webp', { cwd }))
    out.push(join(cwd, entry));
  return out.sort();
}

async function resolveArg(arg) {
  if (arg.endsWith('.webp')) return [join(COLORING_DIR, arg)];
  const asFile = join(COLORING_DIR, `${arg}.outline.webp`);
  if (existsSync(asFile)) return [asFile];
  const asDir = join(COLORING_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return pagesUnder(arg);
  return [asFile];
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string', short: 'n' },
    temperature: { type: 'string', short: 't' },
    tall: { type: 'boolean' },
    wide: { type: 'boolean' },
    'max-attempts': { type: 'string' },
    'drift-threshold': { type: 'string' },
    'night-luma-max': { type: 'string' },
    'line-white-min': { type: 'string' },
    'dilate-lines': { type: 'string' },
  },
});
const samples = values.samples === undefined ? 1 : Number(values.samples);
if (!(Number.isInteger(samples) && samples >= 1)) fail(`--samples must be a positive integer`);
const baseTemp = values.temperature === undefined ? 0.6 : Number(values.temperature);
const maxAttempts = values['max-attempts'] === undefined ? 3 : Number(values['max-attempts']);
if (!(Number.isInteger(maxAttempts) && maxAttempts >= 1))
  fail(`--max-attempts must be a positive integer`);
const driftThreshold =
  values['drift-threshold'] === undefined
    ? DRIFT_THRESHOLD_DEFAULT
    : Number(values['drift-threshold']);
if (!(driftThreshold >= 0)) fail(`--drift-threshold must be a non-negative number`);
const nightLumaMax =
  values['night-luma-max'] === undefined
    ? NIGHT_BG_LUMA_MAX_DEFAULT
    : Number(values['night-luma-max']);
if (!(nightLumaMax >= 0)) fail(`--night-luma-max must be a non-negative number`);
const lineWhiteMin =
  values['line-white-min'] === undefined
    ? LINE_WHITE_MIN_DEFAULT
    : Number(values['line-white-min']);
if (!(lineWhiteMin >= 0)) fail(`--line-white-min must be a non-negative number`);
const dilateLines = values['dilate-lines'] === undefined ? 0 : Number(values['dilate-lines']);
if (!(Number.isInteger(dilateLines) && dilateLines >= 0))
  fail(`--dilate-lines must be a non-negative integer`);
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

// Generate one take, register it to the source, and score four ways: structural
// DRIFT (invented outlines), NIGHT-ness (background too bright / daytime), LINE
// color (outlines re-inked dark instead of staying white), and EYES (every eye
// the page's light fill paints must stay lively at night — not flooded flat;
// lib/eye-fill.mjs, skipped when the page has no committed light raw to
// reference). Retry (with a rising temperature to shake loose a different
// composition) until a take passes all gates or the attempt budget runs out. A
// take is "acceptable" when its background reads as night AND its outlines
// stayed white AND its eyes are painted; among acceptable takes we keep the
// least-drifted, and stop early once one is also drift-clean. If none qualify
// we fall back to the least-drifted take overall and flag it, so even a
// stubborn page yields a render.
async function generateCleanTake({ darkInput, source, width, height, temp0, lightEyes }) {
  let best = null; // lowest drift overall (fallback)
  let bestAccept = null; // lowest drift among takes that pass mood + line + eyes
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const temperature = Math.min(2, temp0 + (attempt - 1) * 0.15);
    const { bytes } = await generateDarkPage(ai, {
      imageBytes: darkInput,
      mimeType: 'image/webp',
      temperature,
    });
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    // Edges are polarity-agnostic, so align the colored output to the ORIGINAL
    // black-line source to undo the model's few-pixel nudge.
    const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
    const drift = await scoreDrift(aligned, source);
    const night = await scoreNightness(aligned, source);
    const line = await scoreLineColor(aligned, source);
    const eyes = lightEyes
      ? judgeNightEyes(await scoreEyeFill(aligned, source), lightEyes)
      : { passes: true, failed: 0 };
    const take = { aligned, dx, dy, drift, night, line, eyes, attempt };
    if (!best || drift.ratio < best.drift.ratio) best = take;
    const moodOk = night.bgLuma <= nightLumaMax;
    const lineOk = line.lineWhite >= lineWhiteMin;
    if (moodOk && lineOk && eyes.passes && (!bestAccept || drift.ratio < bestAccept.drift.ratio))
      bestAccept = take;
    if (drift.ratio <= driftThreshold && moodOk && lineOk && eyes.passes) break;
  }
  return bestAccept ?? best;
}

let pages = positionals.length
  ? (await Promise.all(positionals.map(resolveArg))).flat()
  : fail('give a category or page, e.g. "space"');
// Optionally restrict to one orientation (e.g. generate wide fills without
// retouching already-good tall ones). --tall and --wide are mutually exclusive.
if (values.tall && values.wide) fail('pass only one of --tall / --wide');
if (values.tall) pages = pages.filter((p) => p.includes('-tall'));
if (values.wide) pages = pages.filter((p) => p.includes('-wide'));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let failures = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '');
  const source = await readFile(page);
  const { width, height } = await sharp(source).metadata();
  const darkInput = await toDarkInput(source);
  // Eye reference: which nested cores the committed light fill paints as lively
  // eyes. Absent (page has no light raw yet) the eye gate is skipped.
  const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const lightEyes = existsSync(lightRawPath)
    ? await scoreEyeFill(await readFile(lightRawPath), source)
    : null;

  for (let i = 0; i < samples; i++) {
    const label = samples > 1 ? `${rel}  ${i + 1}/${samples}` : rel;
    process.stdout.write(`${label} ... `);
    try {
      const take = await generateCleanTake({
        darkInput,
        source,
        width,
        height,
        temp0: baseTemp + i * 0.12,
        lightEyes,
      });
      const colored = await sharp(take.aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const dir = join(OUT_DIR, dirname(rel));
      await mkdir(dir, { recursive: true });
      const base = rel.split('/').pop();
      const out = join(dir, samples > 1 ? `${base}.sample-${i + 1}.webp` : `${base}.webp`);
      await sharp(colored).toFile(out);
      // Also stash the dark input beside it once, for the review montage.
      if (i === 0) await sharp(darkInput).toFile(join(dir, `${base}.input.webp`));
      const nudge = take.dx || take.dy ? `  shift ${take.dx},${take.dy}` : '';
      const tries = take.attempt > 1 ? `  (${take.attempt} tries)` : '';
      const stats = `  drift ${take.drift.ratio.toFixed(4)} bgLuma ${take.night.bgLuma.toFixed(0)} lineW ${take.line.lineWhite.toFixed(0)}`;
      const warn =
        (take.drift.ratio > driftThreshold ? '  ⚠ still drifting' : '') +
        (take.night.bgLuma > nightLumaMax ? '  ⚠ too bright/daytime' : '') +
        (take.line.lineWhite < lineWhiteMin ? '  ⚠ dark outlines' : '') +
        (take.eyes.passes ? '' : `  ⚠ flat eyes (${take.eyes.failed})`);
      console.log(`ok${nudge}${tries}${stats}${warn}  -> ${relative(REPO_ROOT, out)}`);
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}
if (failures) fail(`${failures} render(s) failed.`);
console.log('Done.');
