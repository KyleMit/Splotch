// Generate a page's CHALK OUTLINE — the dedicated dark-mode line art that forks
// from the single shared outline (the "pen outline", {page}.outline.webp).
//
// Terms: the PEN outline is black ink on white paper (light mode); the CHALK
// outline is white ink on a black board (dark mode). The chalk is not a blind
// invert of the pen: Gemini redraws the inverted pen as a proper chalk line
// drawing, making the judgment calls a chalk artist makes about what should be
// SOLID WHITE (eye sclera, catchlights, teeth, small white markings) and what
// should stay black (pupils, the open board). Dark mode then renders the chalk
// as-is and the night punch masks the night fill with it, so the chalk's whites
// survive into the final combined image by construction — no blob detection, no
// fill-referencing punch.
//
// STORAGE POLARITY: the shipped {page}.chalk.webp is stored INK-ON-WHITE (the
// negation of what dark mode displays). That keeps the app's existing dark-mode
// treatment working unchanged (--lineart-filter: invert(1) + screen), lets every
// ink-on-white analysis tool (outline-match, punch mask, drift audit) read the
// chalk unmodified, and compresses better than an alpha layer (lossy webp,
// no alpha plane to encode or silently flatten). Anything that hands the chalk
// to Gemini or a human negates it back to white-on-black first.
//
// Gates per candidate (keep-best-of-N with a rising temperature ladder):
//   1. keep/localKeep — outlineMatch(pen, candidate): every pen stroke is still
//      traced, globally and in the worst tile (solid whites only ADD ink, so the
//      forward direction must hold completely).
//   2. no invented strokes — new ink far from any pen line must be SOLID
//      (a deliberate white region); thin new ink is an invented outline.
//   3. background integrity — new solid ink must not flood the open background
//      (the region reachable from the page border), only pen-bounded interiors.
//   4. white budget — total solid-whitened area stays a small share of the page.
//
// Candidates land in .coloring-samples-dark/chalk/ (with a .display.webp preview
// of what dark mode will show); shipped assets are only touched with --apply,
// and --apply only copies a candidate that passed every gate. After applying,
// regenerate the page's night fill from the chalk and re-punch.
//
//   npm run gen:coloring-chalk -- nature                    whole category
//   npm run gen:coloring-chalk -- nature/ant-tall --apply   ship the passing candidate
//   ... --max-attempts 6  -t 0.5  --notes "…"  --force      the usual levers
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { alignToSource } from './lib/align-to-source.mjs';
import { dilateMask, erodeMask } from './lib/morphology.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const WEBP_QUALITY = 92;
const OUT_DIR = join(SAMPLES_DARK_DIR, 'chalk');

// --- New-ink analysis ----------------------------------------------------------
// Everything the chalk draws beyond the pen's strokes is "new ink". Deliberate
// whites are SOLID regions; anything thin is an invented stroke. Same working
// scale and ink bar as lib/outline-match.mjs so the masks agree.
const INK_W = 512;
const INK_DARK = 110; // grayscale px darker than this = ink
const PEN_SLACK = 2; // px of registration slack around pen strokes (outline-match TOL)
const OPEN_R = 3; // opening radius: new ink thinner than ~2*OPEN_R px = a stroke, not a fill
// Thin new ink beyond this share of the pen's ink mass = invented outlines.
const INVENTED_MAX_DEFAULT = 0.01;
// New solid ink overlapping the open background beyond this share of the page =
// the model flooded the board, not a bounded region.
const BG_FLOOD_MAX = 0.002;
// Total solid-whitened share of the page a chalk may claim (eyes/teeth/markings
// are small; a whole white body is a review-worthy surprise).
const WHITE_FRAC_MAX_DEFAULT = 0.1;

async function inkMask(buf) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(INK_W, INK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(INK_W * INK_W);
  for (let i = 0; i < data.length; i++) mask[i] = data[i] < INK_DARK ? 1 : 0;
  return mask;
}

// The open background of the pen page: every non-ink pixel reachable from the
// border (same flood the night-fill mood scorer uses). A chalk must never
// whiten it — chalk whites live in pen-bounded interiors.
function openBackground(penMask) {
  const w = INK_W;
  const h = INK_W;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && !penMask[i]) {
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
  return bg;
}

// Split a candidate's new ink (beyond the pen's slack-dilated strokes) into
// SOLID regions (deliberate whites) and THIN residue (invented strokes), and
// measure how much solid ink landed on the open background.
async function scoreNewInk(penBuf, candidateBuf) {
  const pen = await inkMask(penBuf);
  const cand = await inkMask(candidateBuf);
  const n = INK_W * INK_W;
  const allowed = dilateMask(pen, INK_W, INK_W, PEN_SLACK);
  const newInk = new Uint8Array(n);
  for (let i = 0; i < n; i++) newInk[i] = cand[i] && !allowed[i] ? 1 : 0;
  const solid = dilateMask(erodeMask(newInk, INK_W, INK_W, OPEN_R), INK_W, INK_W, OPEN_R);
  // Thin residue hugging a solid region's boundary is antialiasing of the fill,
  // not an invented stroke — excuse anything within a small halo of a solid.
  const nearSolid = dilateMask(solid, INK_W, INK_W, OPEN_R);
  const bg = openBackground(pen);
  let penMass = 0;
  let invented = 0;
  let solidPx = 0;
  let bgFlood = 0;
  for (let i = 0; i < n; i++) {
    if (pen[i]) penMass++;
    if (newInk[i] && !solid[i] && !nearSolid[i]) invented++;
    if (newInk[i] && solid[i]) {
      solidPx++;
      if (bg[i]) bgFlood++;
    }
  }
  return {
    inventedRatio: penMass ? invented / penMass : 0,
    whiteFrac: solidPx / n,
    bgFloodFrac: bgFlood / n,
  };
}

const INSTRUCTION = `This is a children's coloring-page drawing rendered as WHITE line art on a BLACK background — a chalk line drawing on a blackboard.

YOUR EDIT — redraw it as a proper CHALK LINE DRAWING, making the judgment calls a chalk artist makes about which areas should be SOLID WHITE and which should stay black:
- THE WHITES OF EYES: fill each eye's sclera (the area inside the eyeball outline, around the pupil) SOLID WHITE, and fill each tiny catchlight/glare circle SOLID WHITE, so the eyes read correctly on the dark board.
- PUPILS STAY BLACK — the dark board showing through, surrounded by the solid white sclera. Never fill a pupil white.
- Small features that are naturally white on the subject (teeth, a white patch or marking, a sparkle) may also be filled solid white.
- Everything else stays exactly as it is: thin white outlines on black.

ABSOLUTE RULES:
- Keep every existing white line exactly where it is — do not move, redraw, thicken, thin, smooth, or erase a single line. The drawing must line up pixel-for-pixel with the original.
- Do not add any new lines, shapes, stars, dots, patterns, decorations, or objects. The ONLY change allowed is filling some existing enclosed regions solid white.
- NEVER fill the open background white, and never fill a large body or a whole shape white — only small deliberate features (eye whites, catchlights, teeth, small markings).
- Output PURE WHITE on PURE BLACK only — no grey, no color, no shading, no chalk texture, dust, or smudging.
- Keep the same polarity as the input: a white drawing on a black background.
- Do not crop, zoom, rotate, shift, or resize. Same composition, framing, and margins.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean' },
    force: { type: 'boolean' },
    notes: { type: 'string' },
    temperature: { type: 'string', short: 't' },
    'max-attempts': { type: 'string' },
    'invented-max': { type: 'string' },
    'white-frac-max': { type: 'string' },
  },
});
if (!positionals.length)
  fail('give one or more pages or categories, e.g. "nature/ant-tall" or "nature"');
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');
const baseTemp = values.temperature === undefined ? 0.35 : Number(values.temperature);
if (!(baseTemp >= 0 && baseTemp <= 2)) fail('--temperature must be between 0 and 2');
const maxAttempts = values['max-attempts'] === undefined ? 4 : Number(values['max-attempts']);
if (!(Number.isInteger(maxAttempts) && maxAttempts >= 1))
  fail('--max-attempts must be a positive integer');
const inventedMax =
  values['invented-max'] === undefined ? INVENTED_MAX_DEFAULT : Number(values['invented-max']);
if (!(inventedMax >= 0)) fail('--invented-max must be a non-negative number');
const whiteFracMax =
  values['white-frac-max'] === undefined
    ? WHITE_FRAC_MAX_DEFAULT
    : Number(values['white-frac-max']);
if (!(whiteFracMax >= 0)) fail('--white-frac-max must be a non-negative number');
const instruction = values.notes
  ? `${INSTRUCTION}\n\nPAGE-SPECIFIC NOTES:\n${values.notes}`
  : INSTRUCTION;

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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function drawChalk(imageBytes, temperature) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/webp',
              data: Buffer.from(imageBytes).toString('base64'),
            },
          },
          { text: instruction },
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

// Model output (white-on-black) -> stored ink polarity at source resolution:
// grayscale, negate, then the same gentle contrast as the other line-art
// generators (whiten a faintly-grey ground, deepen the ink, keep antialiasing).
async function toInkPolarity(buf, width, height) {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .negate()
    .linear(1.25, -18)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

const passes = (c) =>
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.newInk.inventedRatio <= inventedMax &&
  c.newInk.bgFloodFrac <= BG_FLOOD_MAX &&
  c.newInk.whiteFrac <= whiteFracMax;
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  (c.newInk.bgFloodFrac <= BG_FLOOD_MAX ? 400 : 0) +
  (c.newInk.inventedRatio <= inventedMax ? 300 : 0) +
  c.localKeep * 200 +
  c.keep * 100;

const pages = (await Promise.all(positionals.map(resolveArg))).flat();

let failures = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page)
    .replace(/\.outline\.webp$/, '')
    .replace(/\\/g, '/');
  if (!existsSync(page)) {
    console.warn(`(skip) no line art at ${page}`);
    continue;
  }
  const dest = join(COLORING_DIR, `${rel}.chalk.webp`);
  if (existsSync(dest) && !values.force && !values.apply) {
    console.log(`${rel}  chalk already shipped — skipping (--force to redraw)`);
    continue;
  }
  const pen = await readFile(page);
  const { width, height } = await sharp(pen).metadata();
  const displayInput = await sharp(pen)
    .negate({ alpha: false })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  process.stdout.write(`${rel} ... `);
  let best = null;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const temperature = Math.min(2, baseTemp + attempt * 0.15);
      const drawn = await drawChalk(displayInput, temperature);
      const inked = await toInkPolarity(drawn, width, height);
      const { buffer: aligned, dx, dy } = await alignToSource(inked, pen, width, height);
      const candidate = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const fwd = await outlineMatch(pen, candidate);
      const newInk = await scoreNewInk(pen, candidate);
      const cand = {
        candidate,
        keep: fwd.keep,
        localKeep: fwd.localKeep,
        overlay: fwd.overlay,
        newInk,
        shift: { dx, dy },
        attempt,
      };
      if (!best || rank(cand) > rank(best)) best = cand;
      if (passes(cand)) break;
    }
  } catch (err) {
    failures++;
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    continue;
  }

  const sample = join(OUT_DIR, `${rel}.webp`);
  await mkdir(dirname(sample), { recursive: true });
  await writeFile(sample, best.candidate);
  // What dark mode will actually show — the negation — for human review.
  await sharp(best.candidate)
    .negate({ alpha: false })
    .webp({ quality: WEBP_QUALITY })
    .toFile(sample.replace(/\.webp$/, '.display.webp'));
  await sharp(best.overlay).toFile(sample.replace(/\.webp$/, '.overlay.png'));

  const ok = passes(best);
  const tries = best.attempt > 0 ? `  (${best.attempt + 1} tries)` : '';
  const nudge = best.shift.dx || best.shift.dy ? `  shift ${best.shift.dx},${best.shift.dy}` : '';
  const warn = [];
  if (best.keep < KEEP_THRESHOLD) warn.push('drifting');
  if (best.localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
  if (best.newInk.inventedRatio > inventedMax) warn.push('invented strokes');
  if (best.newInk.bgFloodFrac > BG_FLOOD_MAX) warn.push('flooded background');
  if (best.newInk.whiteFrac > whiteFracMax) warn.push('over-whitened');
  const stats = `keep ${(best.keep * 100).toFixed(1)}%  local ${(best.localKeep * 100).toFixed(1)}%  white ${(best.newInk.whiteFrac * 100).toFixed(1)}%  invented ${best.newInk.inventedRatio.toFixed(4)}`;
  console.log(
    `${stats}${nudge}${tries}${warn.length ? `  ⚠ ${warn.join(' + ')}` : ''}  -> ${relative(REPO_ROOT, sample)}`
  );

  if (values.apply) {
    if (!ok) {
      failures++;
      console.log(`  ✗ NOT applied — gates unmet; review ${relative(REPO_ROOT, sample)} or retry`);
    } else {
      await writeFile(dest, best.candidate);
      console.log(
        `  ✓ applied to ${relative(REPO_ROOT, dest)} — regenerate its night fill + re-punch`
      );
    }
  }
}
if (failures) fail(`${failures} page(s) did not chalk cleanly.`);
console.log('Done.');
