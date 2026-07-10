// Generates a flat-color "answer key" for each black-and-white coloring page in
// web/static/coloring/ by asking Gemini to color inside the existing lines.
// The colored version keeps the page's exact black outlines and only fills the
// white regions with solid flat color, so the magic brush can pair each page
// with its colored twin and reveal the prefilled colors as a child paints.
//
// Shipping is two files per twin: the raw (lined) result is committed to
// tools/asset-gen/twin-src/ as the source of truth — the drift audit scores it —
// and its fills-only punch (outlines masked out with the line art, so the app's
// overlay is the single source of line work) is what lands in web/static/coloring/
// as the shipped .color.webp (lib/punch-twin.mjs; ADR-0043 "reveal fills only").
//
// Requires GEMINI_API_KEY. Run via npm so the .ts imports resolve:
//   npm run gen:coloring-fills                                 all pages
//   npm run gen:coloring-fills -- creatures dinosaur           whole categories
//   npm run gen:coloring-fills -- farm/dog-wide                one page
//   npm run gen:coloring-fills -- farm/dog-wide --samples 5    5 candidates
//   npm run gen:coloring-fills -- farm/dog-wide -t 1.2         hotter retry
//
// Each candidate is post-processed and scored before it's kept:
//   1. alignToSource undoes the few-pixel GLOBAL nudge the model tends to add, so
//      the colored outlines re-register onto the source. It's a single translation,
//      so it can't fix a feature that drifted on its own (step 2 catches that).
//   2. outlineMatch reports `keep` (global outline coverage) AND `localKeep` (the
//      worst grid tile's coverage) by overlaying the two outline masks. localKeep
//      is the gate that catches a localized drift a high global keep would hide.
//   3. whiteFraction reports how much of the page is left pure white; big blank
//      areas would look uncolored under the child's brush, so they're rejected.
// A candidate that fails any gate is retried (temperature nudged up); the best
// attempt is kept if none fully pass. (See lib/outline-match.mjs; the same scoring
// backs `npm run gen:coloring-fills:audit`, which flags already-shipped twins.)
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, TWIN_SRC_DIR, SAMPLES_DIR, fail } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { punchTwin } from './lib/punch-twin.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const WEBP_QUALITY = 90;

// The single prompt used for every page — no per-page tailoring. It leans hard
// on "do not touch the lines" because the whole point is a pixel-faithful twin.
const FILL_PROMPT = `You are given a black-and-white coloring-book page for a toddler. Color it in neatly, exactly like a completed page in a coloring book.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every black outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The black line art must be pixel-for-pixel identical to the original.
- Do not add any new lines, outlines, details, decorations, patterns, textures, letters, or objects. Only add color to the empty white areas that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

COLORING STYLE:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no shadows, no extra outlines around the fills, no crayon or paint texture.
- Choose simple, cheerful, natural colors that suit each part of the picture.
- Stay inside the lines; every fill should butt right up against the black outline without covering it.

FILL EVERYTHING — no blank white:
- Every enclosed region must be filled with a color, including the whole background and sky. No area may be left as plain white paper, because a blank area would look uncolored.
- Things that are normally white must still get a soft tint instead of pure white: color clouds, snow, the moon, teeth, white fur or white clothing a pale cream or very light pastel; color a plain background a light color (for example a soft sky blue behind an outdoor scene, or a gentle cream/pastel behind a single object).
- The ONLY places allowed to stay pure white are tiny highlights, such as a small glint in an eye or a little shine dot.

The result must look like the identical line drawing, fully colored in with clean flat colors and no blank white gaps.`;

// Generate one flat-colored version of a coloring page. Returns raw image bytes
// + mime type, or throws with the refusal/empty reason. Kept free of file/CLI
// concerns so it can be reused (batch, samples, or eventually in-app).
export async function generateColoredPage(ai, { imageBytes, mimeType, temperature }) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(imageBytes).toString('base64') } },
          { text: FILL_PROMPT },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      ...(temperature === undefined ? {} : { temperature }),
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') {
    throw new Error(`${classified.kind}: ${classified.reason}`);
  }
  return { bytes: Buffer.from(classified.data, 'base64'), mimeType: classified.mimeType };
}

// The model sometimes returns the fill nudged a few pixels (usually rightward)
// even though it otherwise lines up perfectly. alignToSource detects that global
// translation and shifts the colored image back into registration.
//
// It correlates edge maps rather than dark masks: the source's black lines and
// the colored image's outlines are both strong edges, while flat fills are not —
// so a solid dark fill can't pull the match off the outlines (which a plain
// dark-pixel overlap would). The winning offset is the colored image's
// displacement; the correction is its negation.
const ALIGN_MAX = 12; // search radius (px) for the registration nudge
const ALIGN_W = 1000; // work resolution for the correlation

async function grayRaw(buf, w, h) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function edgeMap(g, w, h) {
  const e = new Float32Array(w * h);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      e[i] = Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]);
    }
  }
  return e;
}

export async function alignToSource(coloredBuf, sourceBuf, width, height) {
  const w = Math.min(width, ALIGN_W);
  const h = Math.round((height * w) / width);
  const srcE = edgeMap(await grayRaw(sourceBuf, w, h), w, h);
  const colE = edgeMap(await grayRaw(coloredBuf, w, h), w, h);
  const idx = [];
  const wt = [];
  for (let i = 0; i < srcE.length; i++) {
    if (srcE[i] > 60) {
      idx.push(i);
      wt.push(srcE[i]);
    }
  }
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -ALIGN_MAX; dy <= ALIGN_MAX; dy++) {
    for (let dx = -ALIGN_MAX; dx <= ALIGN_MAX; dx++) {
      let s = 0;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const x = (i % w) + dx;
        const y = ((i / w) | 0) + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        s += wt[k] * colE[y * w + x];
      }
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  // Scale the detected displacement back to native pixels; the correction is its
  // negation (undo the shift the model applied).
  const scale = width / w;
  const cdx = Math.round(-best.dx * scale);
  const cdy = Math.round(-best.dy * scale);
  if (cdx === 0 && cdy === 0) return { buffer: coloredBuf, dx: 0, dy: 0 };
  const pad = Math.ceil(ALIGN_MAX * scale) + 1;
  // Materialize the padded canvas first; chaining extend+extract in one pipeline
  // lets sharp reorder them and mis-computes the window.
  const extended = await sharp(coloredBuf)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
    .toBuffer();
  const clamp = (v, hi) => Math.max(0, Math.min(v, hi));
  const buffer = await sharp(extended)
    .extract({
      left: clamp(pad - cdx, 2 * pad),
      top: clamp(pad - cdy, 2 * pad),
      width,
      height,
    })
    .toBuffer();
  return { buffer, dx: cdx, dy: cdy };
}

// Fraction of the image that is essentially pure white — a large value means big
// blank areas the child's coloring would leave looking untouched. Tiny highlights
// (eye glints, shine) stay well under the reject threshold.
const WHITE_LEVEL = 248;
async function whiteFraction(buf) {
  const { data, info } = await sharp(buf)
    .resize(360, 360, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const n = info.width * info.height;
  let white = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] >= WHITE_LEVEL && data[i + 1] >= WHITE_LEVEL && data[i + 2] >= WHITE_LEVEL) white++;
  }
  return white / n;
}

// Colorable pages under a subdirectory: every *-tall / *-wide page, skipping the
// category covers. `sub` = '' means the whole coloring tree.
async function pagesUnder(sub = '') {
  const out = [];
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  for await (const entry of glob('**/*-{tall,wide}.webp', { cwd })) {
    out.push(join(cwd, entry));
  }
  return out.sort();
}

// Resolve one CLI argument to a list of source pages. An argument is either a
// single page ("farm/dog-wide", with or without .webp) or a category directory
// ("creatures") that expands to every page inside it.
async function resolveArg(arg) {
  if (arg.endsWith('.webp')) return [join(COLORING_DIR, arg)];
  const asFile = join(COLORING_DIR, `${arg}.webp`);
  if (existsSync(asFile)) return [asFile];
  const asDir = join(COLORING_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return pagesUnder(arg);
  return [asFile]; // let the later readFile surface a clear ENOENT
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string', short: 'n' },
    temperature: { type: 'string', short: 't' },
  },
});

const samples = values.samples === undefined ? 1 : Number(values.samples);
if (!(Number.isInteger(samples) && samples >= 1)) {
  fail(`--samples must be a positive integer, got "${values.samples}"`);
}
const baseTemp = values.temperature === undefined ? undefined : Number(values.temperature);
if (baseTemp !== undefined && !(baseTemp >= 0 && baseTemp <= 2)) {
  fail(`--temperature must be a number between 0 and 2, got "${values.temperature}"`);
}
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

const pages = positionals.length
  ? (await Promise.all(positionals.map(resolveArg))).flat()
  : await pagesUnder();
const sampleMode = samples > 1;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// A candidate is only usable if it holds the original outline — globally AND in
// every region — and leaves no big blank-white area. Below any bar the twin either
// drifted off its outline or reads as half-uncolored, so reject and retry.
//
// KEEP is the global coverage; LOCAL_KEEP gates the WORST tile (both imported from
// lib/outline-match.mjs, shared with the auditor). A high global keep can hide a
// small feature that drifted badly: nature/ant-wide scored 93% global (over the old
// 92% bar) while its flower tile was 34% — the drift the child sees. Gating the
// worst tile is what catches that; the global bar alone never could.
const WHITE_THRESHOLD = 0.05; // >5% pure white ⇒ blank areas left uncolored
const MAX_ATTEMPTS = 5;

// Colouring variety comes from sampling; the hard constraint is fidelity. Spread
// the per-slot temperature just enough for different palettes, and nudge it on a
// retry to escape a bad draw. Slot 0 (or single batch render) stays coolest.
function baseTempForSlot(i) {
  if (baseTemp !== undefined) return baseTemp;
  return samples === 1 ? 0.55 : 0.55 + i * 0.12;
}

// A candidate clears if it holds the outline globally AND in its worst tile, and
// isn't mostly blank white.
const passes = (c) =>
  c.keep >= KEEP_THRESHOLD && c.localKeep >= LOCAL_KEEP_THRESHOLD && c.white <= WHITE_THRESHOLD;
// Rank for keeping the best of several imperfect attempts: fidelity is the hard
// constraint (global then worst-tile), then prefer less leftover white.
const rank = (c) => (passes(c) ? 1000 : 0) + c.localKeep * 200 + (1 - c.white) * 100 + c.keep;

// Generate, size-match, re-register onto the source outline, and score one
// candidate; retry until it passes both gates, keeping the best attempt if none
// fully do. Returns the winning colored bytes, its scores, and its overlay.
async function renderClean(source, width, height, slot) {
  let best = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const temperature = Math.min(2, baseTempForSlot(slot) + attempt * 0.15);
    const { bytes } = await generateColoredPage(ai, {
      imageBytes: source,
      mimeType: 'image/webp',
      temperature,
    });
    // Force the colored twin back to the source's exact pixel dimensions, then
    // undo any few-pixel nudge so it registers 1:1 against the outline page.
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
    const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

    const [{ keep, drift, localKeep, worstTile, overlay }, white] = await Promise.all([
      outlineMatch(source, colored),
      whiteFraction(colored),
    ]);
    const cand = {
      colored,
      keep,
      drift,
      localKeep,
      worstTile,
      overlay,
      white,
      shift: { dx, dy },
      attempt,
    };
    if (!best || rank(cand) > rank(best)) best = cand;
    if (passes(cand)) break;
  }
  return best;
}

let failures = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.webp$/, '');
  const source = await readFile(page);
  const { width, height } = await sharp(source).metadata();

  for (let i = 0; i < samples; i++) {
    const label = sampleMode ? `${rel}  sample ${i + 1}/${samples}` : rel;
    process.stdout.write(`${label} ... `);
    try {
      const cand = await renderClean(source, width, height, i);
      const { colored, keep, localKeep, overlay, white, shift, attempt } = cand;
      const tries = attempt > 0 ? `  (${attempt + 1} tries)` : '';
      const nudge = shift.dx || shift.dy ? `  shift ${shift.dx},${shift.dy}` : '';
      const warn = [];
      if (keep < KEEP_THRESHOLD) warn.push('drifting');
      if (localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
      if (white > WHITE_THRESHOLD) warn.push('white');
      const flag = warn.length ? `  ⚠ ${warn.join(' + ')}` : '';
      const score = `keep ${(keep * 100).toFixed(1)}%  local ${(localKeep * 100).toFixed(1)}%  white ${(white * 100).toFixed(1)}%${nudge}`;

      let out;
      if (sampleMode) {
        const dir = join(SAMPLES_DIR, rel);
        await mkdir(dir, { recursive: true });
        out = join(dir, `sample-${i + 1}.webp`);
        await sharp(colored).toFile(out);
        await sharp(overlay).toFile(join(dir, `sample-${i + 1}.overlay.png`));
      } else {
        // Ship = the raw (lined) twin into twin-src/ as the committed source of
        // truth, then its fills-only punch into web/static (lib/punch-twin.mjs).
        const rawOut = join(TWIN_SRC_DIR, `${rel}.color.raw.webp`);
        await mkdir(dirname(rawOut), { recursive: true });
        await writeFile(rawOut, colored);
        ({ out } = await punchTwin(rawOut));
      }
      console.log(`${score}${tries}${flag}  -> ${relative(REPO_ROOT, out)}`);
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}

if (failures) fail(`${failures} render(s) failed.`);
console.log('Done.');
