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
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT, SAMPLES_DIR } from '../lib/asset-paths.mjs';
import { fail, parsePositiveInt, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { scoreSolidity } from '../lib/solid-regions.mjs';
import { scoreEyeRings, scoreEyes } from '../lib/eye-fill.mjs';
import { scoreOutlineFrame } from '../lib/outline-frame.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import { FRESH_STYLE_PROMPT } from '../lib/prompts.mjs';

// This producer-local q90 is uncalibrated; measure outline ringing and bytes before changing it.
const WEBP_QUALITY = 90;
const BORDER_WHITE_LEVEL = 235;
// Lightweight fraction gate, intentionally independent of the registration mask resolution.
const INK_SCAN_SIZE = 360;
const INK_DARK = 150;

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
const ai = makeClient();

const orient = pageRel.endsWith('-wide') ? 'wide' : pageRel.endsWith('-tall') ? 'tall' : null;
if (!orient) fail(`page "${pageRel}" must end in -tall or -wide`);
const wide = orient === 'wide';
const [W, H] = wide ? [1536, 1024] : [1024, 1536];
const aspect = wide ? '3:2' : '2:3';
const orientWord = wide ? 'LANDSCAPE (wider than tall)' : 'PORTRAIT (taller than wide)';

const maxAttempts = parsePositiveInt(args.values['max-attempts'], '--max-attempts', 5);
const baseTemp = parseTemperature(args.values.temperature, '--temperature', 1.0);

const prompt = `${FRESH_STYLE_PROMPT}

The page is ${orientWord}, ${aspect} aspect ratio.

THE SCENE: ${args.values.scene}${args.values.notes ? `\n\nADDITIONAL INSTRUCTIONS: ${args.values.notes}` : ''}`;

async function generateOutline(temperature) {
  const { bytes } = await generateImage(ai, {
    prompt,
    temperature,
    aspectRatio: aspect,
  });
  return bytes;
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
      if (data[(y * info.width + x) * ch] >= BORDER_WHITE_LEVEL) white++;
    }
  }
  return white / total;
}

// Ink density sanity: an empty page or a dense/greyscale render is a bad draw
// regardless of the other gates.
async function inkFraction(buf) {
  const { data, info } = await sharp(buf)
    .resize(INK_SCAN_SIZE, INK_SCAN_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let dark = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += ch) if (data[i] < INK_DARK) dark++;
  return dark / n;
}

const BORDER_WHITE_MIN = 0.97;
const INK_MIN = 0.01;
const INK_MAX = 0.2;

const outDir = join(SAMPLES_DIR, 'fresh', pageRel.split('/')[0]);
await mkdir(outDir, { recursive: true });
const pageName = pageRel.split('/')[1];

const passes = (c) => c.solidOk && c.ringsOk && c.eyesOk && c.borderOk && c.frameOk && c.inkOk;
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  (c.solidOk ? 200 : 0) +
  (c.eyesOk ? 150 : 0) +
  (c.ringsOk ? 100 : 0) +
  (c.frameOk ? 75 : 0) +
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

  const analysis = await prepareOutlineAnalysis(pen);
  const eyeScores = args.values.eyes
    ? scoreEyes(analysis)
    : scoreEyeRings(analysis).then((rings) => ({ rings, cores: null }));
  const [solidity, { rings, cores }, borderWhite, frame, ink] = await Promise.all([
    scoreSolidity(analysis),
    eyeScores,
    borderWhiteFraction(pen),
    scoreOutlineFrame(analysis),
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
    frameOk: frame.passes,
    inkOk: ink >= INK_MIN && ink <= INK_MAX,
    borderWhite,
    frameCoverage: frame.sideCoverage,
    ghostCoverage: frame.ghostCoverage,
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
  if (!cand.frameOk)
    flags.push(
      `page frame ${(cand.frameCoverage * 100).toFixed(1)}%/ghost ${(cand.ghostCoverage * 100).toFixed(1)}%`
    );
  if (!cand.inkOk) flags.push(`ink ${(ink * 100).toFixed(1)}%`);
  console.log(
    `blob ${cand.biggestBlob}  interior ${cand.interiorPx}  rings ${cand.ringDepth}` +
      (cand.coreCount === null ? '' : `  cores ${cand.coreCount}`) +
      `  border ${(borderWhite * 100).toFixed(1)}%  frame ${(cand.frameCoverage * 100).toFixed(1)}%  ink ${(ink * 100).toFixed(1)}%` +
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
  const dest = join(REPO_ROOT, 'vectorized', 'coloring-overlays', `${pageRel}.source.webp`);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(best.file, dest);
  console.log(`staged -> ${relative(REPO_ROOT, dest)}`);
  console.log(
    'now vectorize the source, then regenerate chalk, light fill, night fill, and punch.'
  );
} else {
  console.log('review the candidate, then re-run with --apply to ship it.');
}
