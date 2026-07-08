// EXPERIMENT (not shipped): generate a DARK-THEME colored twin for coloring
// pages — the counterpart to gen-coloring-fills.mjs's light twins. Instead of
// black lines on white filled with pastels, the source is inverted to WHITE
// lines on a dark background and Gemini fills the regions with vivid colors that
// glow against the dark (a "night / neon" coloring), so dark mode can show a
// whole separate set of renders rather than forcing a light sheet.
//
// Requires GEMINI_API_KEY. Writes candidates to .coloring-samples-dark/ for
// review — it does NOT touch the shipped assets.
//   node scripts/gen-coloring-fills-dark.mjs space               whole category
//   node scripts/gen-coloring-fills-dark.mjs space/astronaut-tall one page
//   node scripts/gen-coloring-fills-dark.mjs space --samples 2    2 takes each
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { ROOT, fail } from './lib/utils.mjs';
import { classifyGeminiResponse } from '../web/src/lib/server/ai/geminiSafety.ts';

// Registration nudge undo, copied from gen-coloring-fills.mjs rather than
// imported — that module runs a CLI at top level, so importing it would re-run
// the light-twin generator (and overwrite shipped assets). Edges are
// polarity-agnostic, so this aligns a dark twin to the original black-line
// source just as well.
const ALIGN_MAX = 12;
const ALIGN_W = 1000;
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
async function alignToSource(coloredBuf, sourceBuf, width, height) {
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
  const scale = width / w;
  const cdx = Math.round(-best.dx * scale);
  const cdy = Math.round(-best.dy * scale);
  if (cdx === 0 && cdy === 0) return { buffer: coloredBuf, dx: 0, dy: 0 };
  const pad = Math.ceil(ALIGN_MAX * scale) + 1;
  const extended = await sharp(coloredBuf)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
    .toBuffer();
  const clamp = (v, hi) => Math.max(0, Math.min(v, hi));
  const buffer = await sharp(extended)
    .extract({ left: clamp(pad - cdx, 2 * pad), top: clamp(pad - cdy, 2 * pad), width, height })
    .toBuffer();
  return { buffer, dx: cdx, dy: cdy };
}

const MODEL = 'gemini-2.5-flash-image';
const COLORING_DIR = join(ROOT, 'web', 'static', 'coloring');
const OUT_DIR = join(ROOT, '.coloring-samples-dark');
const WEBP_QUALITY = 90;

// The input handed to the model is the inverted line art: WHITE outlines on a
// near-black ground. The prompt asks it to keep those white lines and fill the
// regions with colors that read on dark — the "answer key" for a dark theme.
const DARK_FILL_PROMPT = `You are given a toddler coloring-book page drawn as WHITE outlines on a dark background. Color it in like a glowing night-time / neon coloring page.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every WHITE outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The outlines must stay white and pixel-for-pixel identical to the original.
- Do not add any new lines, outlines, stars, dots, details, decorations, patterns, textures, letters, or objects. Only add color to the regions that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

COLORING STYLE — made for a DARK theme:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no crayon or paint texture.
- Use vivid, saturated, luminous colors that pop against a dark background (bright teal, electric blue, magenta, lime, warm gold, coral). Avoid dark muddy colors and avoid near-white fills that would wash out.
- Keep the WHITE outlines fully visible — every fill should butt right up against the white outline without covering it.

BACKGROUND — stays dark:
- The background and any large empty area must be a DEEP DARK color (deep midnight navy or near-black), NOT white and NOT a bright color. It should read as night sky / dark paper so the bright fills glow.
- Do not leave any region pure white except the outlines themselves and tiny eye glints.

The result must look like the identical white-line drawing, filled with bright flat colors on a dark background.`;

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

// Invert the black-on-white line art to white-on-dark. A plain negate yields
// white lines on pure black; nudge the floor up a touch so it reads as deep
// charcoal rather than absolute black (closer to the app's --paper dark).
async function toDarkInput(sourceBuf) {
  return sharp(sourceBuf).negate({ alpha: false }).webp({ quality: WEBP_QUALITY }).toBuffer();
}

async function pagesUnder(sub = '') {
  const out = [];
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  for await (const entry of glob('**/*-{tall,wide}.webp', { cwd })) out.push(join(cwd, entry));
  return out.sort();
}

async function resolveArg(arg) {
  if (arg.endsWith('.webp')) return [join(COLORING_DIR, arg)];
  const asFile = join(COLORING_DIR, `${arg}.webp`);
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
  },
});
const samples = values.samples === undefined ? 1 : Number(values.samples);
if (!(Number.isInteger(samples) && samples >= 1)) fail(`--samples must be a positive integer`);
const baseTemp = values.temperature === undefined ? 0.6 : Number(values.temperature);
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

let pages = positionals.length
  ? (await Promise.all(positionals.map(resolveArg))).flat()
  : fail('give a category or page, e.g. "space"');
// Default the experiment to portrait pages only (half the renders, same read).
if (values.tall) pages = pages.filter((p) => p.includes('-tall'));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let failures = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.webp$/, '');
  const source = await readFile(page);
  const { width, height } = await sharp(source).metadata();
  const darkInput = await toDarkInput(source);

  for (let i = 0; i < samples; i++) {
    const label = samples > 1 ? `${rel}  ${i + 1}/${samples}` : rel;
    process.stdout.write(`${label} ... `);
    try {
      const temperature = Math.min(2, baseTemp + i * 0.12);
      const { bytes } = await generateDarkPage(ai, {
        imageBytes: darkInput,
        mimeType: 'image/webp',
        temperature,
      });
      const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
      // Edges are polarity-agnostic, so align the colored output to the ORIGINAL
      // black-line source to undo the model's few-pixel nudge.
      const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
      const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const dir = join(OUT_DIR, dirname(rel));
      await mkdir(dir, { recursive: true });
      const base = rel.split('/').pop();
      const out = join(dir, samples > 1 ? `${base}.sample-${i + 1}.webp` : `${base}.webp`);
      await sharp(colored).toFile(out);
      // Also stash the dark input beside it once, for the review montage.
      if (i === 0) await sharp(darkInput).toFile(join(dir, `${base}.input.webp`));
      const nudge = dx || dy ? `  shift ${dx},${dy}` : '';
      console.log(`ok${nudge}  -> ${relative(ROOT, out)}`);
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}
if (failures) fail(`${failures} render(s) failed.`);
console.log('Done.');
