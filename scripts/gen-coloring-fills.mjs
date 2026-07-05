// Generates a flat-color "answer key" for each black-and-white coloring page in
// web/static/coloring/ by asking Gemini to color inside the existing lines.
// The colored version keeps the page's exact black outlines and only fills the
// white regions with solid flat color, so a future brush tool can pair each
// page with its colored twin and reveal the prefilled colors as a child paints.
//
// Requires GEMINI_API_KEY. Run via npm so the .ts imports resolve:
//   npm run gen:coloring-fills                                 all pages
//   npm run gen:coloring-fills -- farm/dog-wide                one page
//   npm run gen:coloring-fills -- farm/dog-wide --samples 5    5 candidates
//   npm run gen:coloring-fills -- farm/dog-wide -t 1.2         hotter retry
//
// One page at a time, each candidate is scored against its source by overlaying
// the two black-outline masks (see outlineMatch): `keep` is the fraction of the
// original outline that survives, `added` the fraction of new dark pixels the
// model invented. A good fill keeps ~all of the outline and adds almost none.
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { ROOT, fail } from './lib/utils.mjs';
import { classifyGeminiResponse } from '../web/src/lib/server/aiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const COLORING_DIR = join(ROOT, 'web', 'static', 'coloring');
// Where candidates + overlays land while we're still dialing in the look. The
// shipped colored twins (batch mode) sit next to their source instead.
const SAMPLES_DIR = join(ROOT, '.coloring-samples');
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
- Keep any area that is meant to read as white (or the paper background) plain white.
- Stay inside the lines; every fill should butt right up against the black outline without covering it.

The result must look like the identical line drawing, simply colored in with clean flat colors.`;

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

// Downscaled binary mask of the dark (outline) pixels of an image. Everything
// darker than THRESHOLD counts as ink. Note this also catches genuinely dark
// FILL colors (a brown dog, a navy sky) — outlineMatch handles that below by
// scoring with a tolerance rather than an exact overlap.
const MASK_W = 512;
const THRESHOLD = 110;
async function darkMask(buf) {
  const img = sharp(buf).grayscale().resize(MASK_W, MASK_W, { fit: 'fill' });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) mask[i] = data[i] < THRESHOLD ? 1 : 0;
  return mask;
}

// Whether a mask has any set pixel within `r` of index i (a cheap dilation test).
// Used so a 1px-thicker or slightly anti-aliased line still counts as a match.
function nearby(mask, i, r) {
  const x = i % MASK_W;
  const y = (i / MASK_W) | 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= MASK_W) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= MASK_W) continue;
      if (mask[yy * MASK_W + xx]) return true;
    }
  }
  return false;
}

// Compare the outline of the source page against a colored candidate, tolerant
// of ±TOL px so line-thickening and anti-aliasing don't read as drift.
// `keep`  = fraction of the original outline that has ink within TOL in the
//           candidate — the real "did the outlines survive" score (want ~1).
// `drift` = fraction of the original outline with NO ink nearby — outlines that
//           actually moved or vanished (want ~0).
// The overlay PNG then shows ONLY genuine mismatches: original ink that drifted
// = red, candidate ink far from any original line (invented detail, or a dark
// fill) = blue, everything aligned = near-black.
const TOL = 2;
export async function outlineMatch(sourceBuf, filledBuf) {
  const src = await darkMask(sourceBuf);
  const fill = await darkMask(filledBuf);
  let srcCount = 0;
  let covered = 0;
  const rgb = Buffer.alloc(MASK_W * MASK_W * 3, 255);
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    const f = fill[i];
    const p = i * 3;
    if (s) {
      srcCount++;
      if (nearby(fill, i, TOL)) {
        covered++;
        rgb[p] = 30;
        rgb[p + 1] = 30;
        rgb[p + 2] = 30;
      } else {
        rgb[p] = 230;
        rgb[p + 1] = 50;
        rgb[p + 2] = 50;
      }
    } else if (f && !nearby(src, i, TOL)) {
      rgb[p] = 80;
      rgb[p + 1] = 120;
      rgb[p + 2] = 235;
    }
  }
  const keep = srcCount ? covered / srcCount : 0;
  const drift = 1 - keep;
  const overlay = await sharp(rgb, { raw: { width: MASK_W, height: MASK_W, channels: 3 } })
    .png()
    .toBuffer();
  return { keep, drift, overlay };
}

// Resolve a page argument ("farm/dog-wide", with or without .webp) to its file.
function resolvePage(arg) {
  const rel = arg.endsWith('.webp') ? arg : `${arg}.webp`;
  return join(COLORING_DIR, rel);
}

// All colorable pages: every *-tall / *-wide page, skipping the category covers.
async function allPages() {
  const out = [];
  for await (const entry of glob('**/*-{tall,wide}.webp', { cwd: COLORING_DIR })) {
    out.push(join(COLORING_DIR, entry));
  }
  return out.sort();
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

const pages = positionals.length ? positionals.map(resolvePage) : await allPages();
const sampleMode = samples > 1;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// A candidate is only usable if it preserves this much of the original outline
// (within the ±TOL tolerance). Below it, the model redrew the scene and the fill
// no longer lines up with its black-and-white twin — reject and retry.
const KEEP_THRESHOLD = 0.92;
const MAX_ATTEMPTS = 4;

// Colouring variety comes from sampling; the hard constraint is fidelity. Spread
// the per-slot temperature just enough for different palettes, and nudge it on a
// retry to escape a bad draw. Slot 0 (or single batch render) stays coolest.
function baseTempForSlot(i) {
  if (baseTemp !== undefined) return baseTemp;
  return samples === 1 ? 0.55 : 0.55 + i * 0.12;
}

// Generate, size-match, and score one candidate; retry until it clears
// KEEP_THRESHOLD, keeping the best attempt if none do. Returns the winning
// colored bytes, its score, and its overlay.
async function renderClean(source, width, height, slot) {
  let best = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const temperature = Math.min(2, baseTempForSlot(slot) + attempt * 0.15);
    const { bytes } = await generateColoredPage(ai, {
      imageBytes: source,
      mimeType: 'image/webp',
      temperature,
    });
    // Force the colored twin back to the source's exact pixel dimensions so a
    // later brush tool can sample it 1:1 against the outline page.
    const colored = await sharp(bytes)
      .resize(width, height, { fit: 'fill' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const { keep, drift, overlay } = await outlineMatch(source, colored);
    if (!best || keep > best.keep) best = { colored, keep, drift, overlay, attempt };
    if (keep >= KEEP_THRESHOLD) break;
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
      const { colored, keep, drift, overlay, attempt } = await renderClean(
        source,
        width,
        height,
        i
      );
      const tries = attempt > 0 ? `  (${attempt + 1} tries)` : '';
      const flag = keep >= KEEP_THRESHOLD ? '' : '  ⚠ still drifting';
      const score = `outline keep ${(keep * 100).toFixed(1)}%  drift ${(drift * 100).toFixed(1)}%`;

      let out;
      if (sampleMode) {
        const dir = join(SAMPLES_DIR, rel);
        await mkdir(dir, { recursive: true });
        out = join(dir, `sample-${i + 1}.webp`);
        await sharp(colored).toFile(out);
        await sharp(overlay).toFile(join(dir, `sample-${i + 1}.overlay.png`));
      } else {
        out = join(dirname(page), `${rel.split('/').pop()}.color.webp`);
        await sharp(colored).toFile(out);
      }
      console.log(`${score}${tries}${flag}  -> ${relative(ROOT, out)}`);
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}

if (failures) fail(`${failures} render(s) failed.`);
console.log('Done.');
