// IDEA #16 experiment harness (temporary — lives here only for ESM import
// resolution; deleted before the session ends). Generates a NIGHT fill by
// recolor-editing the SHIPPED PUNCHED LIGHT fill (web/static/coloring/**/
// *.light.webp) and scores it with the standard night gates against the chalk,
// plus a line-polarity band metric and a light<->night palette-coherence score.
// Compares each take against the shipped night fill (both punched, fills-only).
//
//   node tools/asset-gen/idea16-recolor-night.mjs nature/ant-wide --takes 2 -t 0.35
//   node tools/asset-gen/idea16-recolor-night.mjs nature/ant-wide --baseline-only
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { alignToSource } from './lib/align-to-source.mjs';
import { dilateMask, erodeMask } from './lib/morphology.mjs';
import { compositeNight } from './lib/night-composite.mjs';
import { scoreEyeFill, judgeNightEyes } from './lib/eye-fill.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-16';
const WORK = join(IDEA_DIR, 'work');
const MODEL = 'gemini-2.5-flash-image';

// --- gates copied verbatim (constants + logic) from gen-coloring-fills-dark.mjs ---
const DRIFT_W = 512;
const DRIFT_SRC_DARK = 110;
const DRIFT_DILATE = 6;
const DRIFT_THIN = 3;
const DRIFT_LUMA_WHITE = 185;
const DRIFT_CHROMA_MAX = 45;
const NIGHT_W = 384;
const NIGHT_SRC_LIGHT = 170;
const NIGHT_MIN_BG_FRAC = 0.04;
const LINE_W = 512;
const LINE_SRC_DARK = 110;

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
    if (white[i] && !blobs[i] && !allowed[i]) added++;
  }
  return { ratio: srcCount ? added / srcCount : 0, added, srcCount };
}

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
      if (s.data[y * w + x] >= LINE_SRC_DARK) continue;
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

// --- experiment-specific metrics ------------------------------------------------

// Line-polarity band: luma of the FILL directly under the chalk's ink pixels.
// Both shipped nights and recolor takes are fills-only images, so a healthy take
// holds mid/bled color there; a take where the model re-inked dark outlines
// shows a near-black band (fracBlack spikes, median plummets).
async function lineBand(fillBuf, chalkBuf) {
  const s = await sharp(chalkBuf)
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
  const n = w * h;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (s.data[i] < LINE_SRC_DARK) ink[i] = 1;
  const band = dilateMask(ink, w, h, 1);
  const lumas = [];
  let black = 0;
  for (let i = 0; i < n; i++) {
    if (!band[i]) continue;
    lumas.push(t.data[i]);
    if (t.data[i] < 50) black++;
  }
  lumas.sort((a, b) => a - b);
  return { bandMedian: lumas[lumas.length >> 1], fracBlack: black / lumas.length };
}

// Palette coherence between the light fill and a night fill: over SUBJECT pixels
// (not flood-reachable background, not chalk ink) where both images are
// chromatic, the circular hue distance. Lower = the night keeps the light
// palette's hues (just darker); high = regions were recolored to different hues.
async function paletteCoherence(lightBuf, nightBuf, chalkBuf) {
  const W = 256;
  const s = await sharp(chalkBuf)
    .resize(W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const light = (
    await sharp(lightBuf)
      .resize(w, h, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  ).data;
  const night = (
    await sharp(nightBuf)
      .resize(w, h, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  ).data;
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
    push((i % w) + 1, (i / w) | 0);
    push((i % w) - 1, (i / w) | 0);
    push(i % w, ((i / w) | 0) + 1);
    push(i % w, ((i / w) | 0) - 1);
  }
  const hueOf = (r, g, b) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const c = mx - mn;
    if (c === 0) return null;
    let hue;
    if (mx === r) hue = ((g - b) / c) % 6;
    else if (mx === g) hue = (b - r) / c + 2;
    else hue = (r - g) / c + 4;
    return (((hue * 60 + 360) % 360) + 360) % 360;
  };
  const diffs = [];
  let far = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i] || s.data[i] < LINE_SRC_DARK + 20) continue;
    const lr = light[i * 3];
    const lg = light[i * 3 + 1];
    const lb = light[i * 3 + 2];
    const nr = night[i * 3];
    const ng = night[i * 3 + 1];
    const nb = night[i * 3 + 2];
    if (Math.max(lr, lg, lb) - Math.min(lr, lg, lb) < 25) continue;
    if (Math.max(nr, ng, nb) - Math.min(nr, ng, nb) < 25) continue;
    const hl = hueOf(lr, lg, lb);
    const hn = hueOf(nr, ng, nb);
    if (hl === null || hn === null) continue;
    let d = Math.abs(hl - hn);
    if (d > 180) d = 360 - d;
    diffs.push(d);
    if (d > 60) far++;
  }
  diffs.sort((a, b) => a - b);
  if (!diffs.length) return { hueMedian: null, recoloredShare: null, sampled: 0 };
  return {
    hueMedian: diffs[diffs.length >> 1],
    recoloredShare: far / diffs.length,
    sampled: diffs.length,
  };
}

// --- the recolor-edit prompt ------------------------------------------------------
const RECOLOR_PROMPT = `This is a flat-color children's picture-book illustration painted in soft daytime colors (it deliberately has no black outlines). REPAINT THE SAME PICTURE AS A COZY MOONLIT NIGHT SCENE.

ABSOLUTE RULES — the repainted image must line up pixel-for-pixel with the original:
- Keep every shape, region, boundary, and detail EXACTLY where it is. Do not move, resize, redraw, warp, crop, zoom, or rotate anything. Same composition, same framing, same margins.
- Do NOT add any outlines, contour lines, black lines, white lines, strokes, stars, a moon, fireflies, lamps, sparkles, patterns, textures, letters, or any new object or detail. Change COLORS ONLY.
- Do NOT trace or re-ink the shapes with dark or black outlines. The picture must stay an outline-free flat-color painting.

NIGHT RECOLOR — how to change the colors:
- The sky / background and every large open area becomes a DEEP EVENING tone: midnight blue, deep indigo, or dark twilight purple — dark and dim, never a bright daytime blue, never pale, never grey.
- Every other region KEEPS ITS OWN COLOR, just dimmed and cooled by moonlight: the SAME hue, darker and softer. A red thing stays red (a deep night red), a yellow thing stays yellow (a muted moonlit yellow), green grass stays green (a deep evening green). Do NOT swap any region's color for a different hue.
- Fill each region with one solid, flat, even color. No gradients, no shading, no glow, no texture.
- EYES: keep the eye whites and catchlight dots BRIGHT WHITE exactly as they are, and keep the pupils DEEP NEAR-BLACK. Eyes must stay crisp and lively.
- Faces, skin, and animal bodies keep a natural living color — dimmed for night, never grey, ashen, or ghostly.

The result must be the IDENTICAL picture, only with its palette shifted to a dim, cozy, moonlit night — the same drawing photographed at dusk.`;

const RECOLOR_PROMPT_V2 = `This is a flat-color children's picture-book illustration painted in soft daytime colors (it deliberately has no black outlines). REPAINT THE SAME PICTURE AS A RICH, COZY MOONLIT NIGHT SCENE — like a vivid storybook bedtime illustration.

ABSOLUTE RULES — the repainted image must line up pixel-for-pixel with the original:
- Keep every shape, region, boundary, and detail EXACTLY where it is. Do not move, resize, redraw, warp, crop, zoom, or rotate anything. Same composition, same framing, same margins.
- Do NOT add any outlines, contour lines, black lines, white lines, strokes, stars, a moon, fireflies, lamps, sparkles, patterns, textures, letters, or any new object or detail. Change COLORS ONLY.
- Do NOT trace or re-ink the shapes with dark or black outlines. The picture must stay an outline-free flat-color painting.

NIGHT RECOLOR — how to change the colors:
- The SKY / background and every large open area becomes a DEEP, RICH, SATURATED MIDNIGHT BLUE or INDIGO — a beautiful jewel-toned night-sky blue. NEVER grey, NEVER slate, NEVER washed-out. Make it clearly DARK — much darker than the daytime original.
- Every other region KEEPS ITS OWN HUE but becomes a DEEPER, RICHER version of it — like the same scene lit by bright moonlight. Colors must stay VIVID and SATURATED, never muddy, greyed, or washed out. A yellow duck stays clearly warm GOLDEN YELLOW. A red thing stays a deep vivid RED. Green grass becomes a deep rich forest green. Do NOT swap any region's color for a different hue, and do NOT desaturate it into grey or olive sludge.
- Fill each region with one solid, flat, even color. No gradients, no shading, no glow, no texture.
- EYES: keep the eye whites and catchlight dots BRIGHT WHITE exactly as they are, and keep the pupils DEEP NEAR-BLACK. Eyes must stay crisp and lively.
- Faces, skin, and animal bodies keep a warm natural living color — deepened for night, never grey, ashen, or ghostly.

The result must be the IDENTICAL picture with a lush nighttime palette — dark and dim overall, but every color still rich and alive, the way a beautiful picture-book paints midnight.`;

async function generateRecolor(ai, inputBytes, temperature, notes, v2) {
  const base = v2 ? RECOLOR_PROMPT_V2 : RECOLOR_PROMPT;
  const prompt = notes ? `${base}\n\nPAGE-SPECIFIC NOTES:\n${notes}` : base;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/webp',
              data: Buffer.from(inputBytes).toString('base64'),
            },
          },
          { text: prompt },
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
  return Buffer.from(classified.data, 'base64');
}

// --- scoring wrapper ---------------------------------------------------------------
async function scoreFill(label, fillBuf, { chalk, pen, lightFill, lightEyes }) {
  const drift = await scoreDrift(fillBuf, chalk);
  const night = await scoreNightness(fillBuf, chalk);
  const line = await scoreLineColor(fillBuf, chalk);
  const band = await lineBand(fillBuf, chalk);
  const coherence = await paletteCoherence(lightFill, fillBuf, chalk);
  const composite = await compositeNight(fillBuf, chalk);
  const eyes = lightEyes
    ? judgeNightEyes(await scoreEyeFill(composite, pen), lightEyes)
    : { passes: true, failed: 0 };
  const r = {
    label,
    drift: +drift.ratio.toFixed(5),
    bgLuma: +night.bgLuma.toFixed(1),
    lineWhite: line.lineWhite,
    bandMedian: band.bandMedian,
    fracBlack: +band.fracBlack.toFixed(4),
    hueMedian: coherence.hueMedian === null ? null : +coherence.hueMedian.toFixed(1),
    recoloredShare: coherence.recoloredShare === null ? null : +coherence.recoloredShare.toFixed(3),
    eyesPass: eyes.passes,
    eyesFailed: eyes.failed,
  };
  console.log(JSON.stringify(r));
  return { ...r, composite };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    takes: { type: 'string', default: '0' },
    temperature: { type: 'string', short: 't', default: '0.35' },
    notes: { type: 'string' },
    'baseline-only': { type: 'boolean', default: false },
    v2: { type: 'boolean', default: false },
  },
});
const takes = Number(values.takes);
const temp0 = Number(values.temperature);
const rel = positionals[0];
if (!rel) {
  console.error(
    'usage: node idea16-recolor-night.mjs <cat/page-orient> [--takes N] [-t F] [--notes ...]'
  );
  process.exit(1);
}
await mkdir(WORK, { recursive: true });

const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
const chalk = await readFile(join(COLORING_DIR, `${rel}.chalk.webp`));
const lightFill = await readFile(join(COLORING_DIR, `${rel}.light.webp`));
const shippedNight = await readFile(join(COLORING_DIR, `${rel}.night.webp`));
const { width, height } = await sharp(pen).metadata();
const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
const lightEyes = existsSync(lightRawPath)
  ? await scoreEyeFill(await readFile(lightRawPath), pen)
  : null;
console.log(
  `# ${rel}  ${width}x${height}  lightEyes cores: ${lightEyes ? lightEyes.cores.length : 'n/a'}`
);

const ctx = { chalk, pen, lightFill, lightEyes };
const base = rel.replace('/', '-');

const shipped = await scoreFill('shipped-night', shippedNight, ctx);
await writeFile(join(WORK, `${base}.shipped.composite.png`), shipped.composite);

if (!values['baseline-only']) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  for (let i = 1; i <= takes; i++) {
    const t = temp0 + (i - 1) * 0.15;
    process.stdout.write(`take ${i} (t=${t}) ... `);
    const bytes = await generateRecolor(ai, lightFill, t, values.notes, values.v2);
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    const { buffer: aligned, dx, dy } = await alignToSource(resized, chalk, width, height);
    console.log(`shift ${dx},${dy}`);
    const tag = values.v2 ? '-v2' : '';
    await sharp(aligned)
      .webp({ quality: 90 })
      .toFile(join(WORK, `${base}.take-${i}${tag}.webp`));
    const scored = await scoreFill(`recolor-take-${i}${tag}`, aligned, ctx);
    await writeFile(join(WORK, `${base}.take-${i}${tag}.composite.png`), scored.composite);
  }
}
console.log('done');
