// Authors a BRAND-NEW pen outline for a coloring page from a text description —
// no conditioning on the existing drawing. The escape hatch for pages whose pen
// itself is the root problem (solid-ink pupils the light fill can't enliven,
// motif anatomy the fill model keeps misreading): instead of iterating edits on
// a bad drawing, roll a fresh composition of the same subject and let the
// standard suite (thumb + chalk + light + night + punch) regenerate from it.
//
// The style prompt below is the baseline that matches the shipped catalog
// (clean medium-weight black pen outlines, rounded kawaii-cartoon shapes,
// minimal toddler-level detail, outlined pupils with catchlights — never solid
// ink); --scene supplies the 1–2 sentence subject/composition description.
//
// Requires GEMINI_API_KEY:
//   npm run gen:coloring-outlines:fresh -- farm/dog-tall --scene "A happy puppy…"
//   … --eyes            gate: the drawing must contain detectable nested eye cores
//   … --max-attempts 8  keep-best-of-N ladder (default 5)
//   … --apply           ship the best PASSING candidate to web/static/coloring/
//
// Candidates land in .coloring-samples/fresh/ with per-gate scores; nothing is
// shipped without --apply. After applying, regenerate the page's whole suite —
// the old chalk, fills, and thumb all belong to the dead drawing.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, SAMPLES_DIR, fail } from './lib/paths.mjs';
import { scoreSolidity } from './lib/solid-regions.mjs';
import { scoreEyeRings, findEyeCores } from './lib/eye-fill.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-3.1-flash-image';
const WEBP_QUALITY = 90;

const STYLE_PROMPT = `Draw ONE page of a toddler coloring book (for age 2+), in this exact style:

- Clean black pen OUTLINES on a pure white background. Medium, even line weight throughout — like a thick felt-tip pen. No shading, no grey, no color, no hatching, no texture, no text, letters, or numbers, and no border frame around the page.
- Simple, rounded, chunky cartoon shapes with very little detail. Big friendly forms a two-year-old can color. Generous white margins around the drawing.
- EVERY shape is a closed thin-line outline that can be colored in. There must be NO solid black filled areas anywhere on the page.
- If the drawing has a face: each eye is a white eyeball outlined with a thin line, containing ONE outlined pupil circle (drawn as a thin ring, NOT filled black) with ONE small round catchlight circle inside it. Add a simple smiling mouth and thin eyebrow strokes. Never fill a pupil solid black.
- Background elements stay sparse and simple (for example a couple of puffy outlined clouds, small grass tufts, a simple flower) so the page stays easy to color.`;

const args = parseArgs({
  allowPositionals: true,
  options: {
    scene: { type: 'string' },
    eyes: { type: 'boolean' },
    notes: { type: 'string' },
    apply: { type: 'boolean' },
    'max-attempts': { type: 'string' },
    temperature: { type: 'string', short: 't' },
  },
});

const [pageRel] = args.positionals;
if (!pageRel || !args.values.scene) {
  fail(
    'usage: gen:coloring-outlines:fresh -- <category/page-orient> --scene "…" [--eyes] [--apply] [--max-attempts N] [-t F] [--notes "…"]'
  );
}
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

const orient = pageRel.endsWith('-wide') ? 'wide' : pageRel.endsWith('-tall') ? 'tall' : null;
if (!orient) fail(`page "${pageRel}" must end in -tall or -wide`);
const wide = orient === 'wide';
const [W, H] = wide ? [1536, 1024] : [1024, 1536];
const aspect = wide ? '3:2' : '2:3';
const orientWord = wide ? 'LANDSCAPE (wider than tall)' : 'PORTRAIT (taller than wide)';

const maxAttempts = Number(args.values['max-attempts'] ?? 5);
if (!(Number.isInteger(maxAttempts) && maxAttempts >= 1))
  fail('--max-attempts must be a positive integer');
const baseTemp = args.values.temperature === undefined ? 1.0 : Number(args.values.temperature);
if (!(baseTemp >= 0 && baseTemp <= 2)) fail('--temperature must be between 0 and 2');

const prompt = `${STYLE_PROMPT}

The page is ${orientWord}, ${aspect} aspect ratio.

THE SCENE: ${args.values.scene}${args.values.notes ? `\n\nADDITIONAL INSTRUCTIONS: ${args.values.notes}` : ''}`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateOutline(temperature) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      imageConfig: { aspectRatio: aspect },
      temperature,
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') throw new Error(`${classified.kind}: ${classified.reason}`);
  return Buffer.from(classified.data, 'base64');
}

// Normalize the model output to the pen contract: exact page dims, greyscale,
// levels stretched to hard white paper / black ink.
async function toPen(bytes) {
  return sharp(bytes)
    .resize(W, H, { fit: 'fill' })
    .toColourspace('b-w')
    .normalise()
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

// The page border must be clean white paper — catches grey washes, border
// frames, and edge-to-edge compositions that would fight the punch and the
// picker crop.
async function borderWhiteFraction(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const margin = 8;
  let white = 0;
  let total = 0;
  for (let y = 0; y < info.height; y++) {
    const edgeRow = y < margin || y >= info.height - margin;
    for (let x = 0; x < info.width; x++) {
      if (!edgeRow && x >= margin && x < info.width - margin) continue;
      total++;
      if (data[(y * info.width + x) * ch] >= 235) white++;
    }
  }
  return white / total;
}

// Ink density sanity: an empty page or a dense/greyscale render is a bad draw
// regardless of the other gates.
async function inkFraction(buf) {
  const { data, info } = await sharp(buf)
    .resize(360, 360, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let dark = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += ch) if (data[i] < 150) dark++;
  return dark / n;
}

const BORDER_WHITE_MIN = 0.97;
const INK_MIN = 0.01;
const INK_MAX = 0.2;

const outDir = join(SAMPLES_DIR, 'fresh', pageRel.split('/')[0]);
await mkdir(outDir, { recursive: true });
const pageName = pageRel.split('/')[1];

const passes = (c) => c.solidOk && c.ringsOk && c.eyesOk && c.borderOk && c.inkOk;
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  (c.solidOk ? 200 : 0) +
  (c.eyesOk ? 150 : 0) +
  (c.ringsOk ? 100 : 0) +
  (c.borderOk ? 50 : 0) +
  (c.inkOk ? 50 : 0) -
  c.biggestBlob / 100;

let best = null;
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  const temperature = Math.min(2, baseTemp + attempt * 0.1);
  process.stdout.write(
    `${pageRel} attempt ${attempt + 1}/${maxAttempts} (t=${temperature.toFixed(2)}) ... `
  );
  let pen;
  try {
    pen = await toPen(await generateOutline(temperature));
  } catch (err) {
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    continue;
  }

  const [solidity, rings, cores, borderWhite, ink] = await Promise.all([
    scoreSolidity(pen),
    scoreEyeRings(pen),
    args.values.eyes ? findEyeCores(pen) : Promise.resolve(null),
    borderWhiteFraction(pen),
    inkFraction(pen),
  ]);
  const cand = {
    pen,
    attempt,
    biggestBlob: solidity.biggestBlob,
    interiorPx: solidity.interiorPx,
    ringDepth: rings.maxDepth,
    coreCount: cores ? cores.cores.length : null,
    solidOk: solidity.passes,
    ringsOk: rings.passes,
    eyesOk: cores === null ? true : cores.cores.length >= 1,
    borderOk: borderWhite >= BORDER_WHITE_MIN,
    inkOk: ink >= INK_MIN && ink <= INK_MAX,
    borderWhite,
    ink,
  };

  const file = join(outDir, `${pageName}-fresh-${attempt + 1}.outline.webp`);
  await writeFile(file, pen);
  cand.file = file;

  const flags = [];
  if (!cand.solidOk) flags.push(`SOLID blob ${cand.biggestBlob}/interior ${cand.interiorPx}`);
  if (!cand.ringsOk) flags.push(`rings ${cand.ringDepth}`);
  if (!cand.eyesOk) flags.push('no eye cores');
  if (!cand.borderOk) flags.push(`border ${(borderWhite * 100).toFixed(1)}%`);
  if (!cand.inkOk) flags.push(`ink ${(ink * 100).toFixed(1)}%`);
  console.log(
    `blob ${cand.biggestBlob}  interior ${cand.interiorPx}  rings ${cand.ringDepth}` +
      (cand.coreCount === null ? '' : `  cores ${cand.coreCount}`) +
      `  border ${(borderWhite * 100).toFixed(1)}%  ink ${(ink * 100).toFixed(1)}%` +
      (flags.length ? `  ⚠ ${flags.join(' + ')}` : '  ✓') +
      `  -> ${relative(REPO_ROOT, file)}`
  );

  if (!best || rank(cand) > rank(best)) best = cand;
  if (passes(cand)) break;
}

if (!best) fail('every attempt failed to render.');
if (!passes(best)) {
  fail(
    `no candidate passed every gate — best was attempt ${best.attempt + 1} (${relative(REPO_ROOT, best.file)}). Review it, then re-run (more attempts / --notes) or --apply is refused.`
  );
}

console.log(`\nbest: attempt ${best.attempt + 1} -> ${relative(REPO_ROOT, best.file)}`);
if (args.values.apply) {
  const dest = join(COLORING_DIR, `${pageRel}.outline.webp`);
  await copyFile(best.file, dest);
  console.log(`applied -> ${relative(REPO_ROOT, dest)}`);
  console.log('now regenerate the suite: thumbs, chalk, light fill, night fill, punch.');
} else {
  console.log('review the candidate, then re-run with --apply to ship it.');
}
