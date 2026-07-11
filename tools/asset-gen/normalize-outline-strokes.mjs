// Normalize a coloring page's BASE LINE ART to thin strokes only: every SOLID
// black region (a cartoon pupil, a tire, a black patch) is redrawn as an
// OUTLINED shape with a white interior, via Gemini image editing.
//
// Why: dark mode inverts the line art (ADR-0052) and punches its dark pixels out
// of the fills (ADR-0043) — both steps assume "dark pixel = thin stroke", so a
// solid region renders as a WHITE BLOB at night and its (correct) fill pixels are
// deleted. With thin-stroke-only outlines the blanket invert is correct by
// construction, and the fill generators see blob-free inputs — so the fills'
// eye/tire/patch interiors regenerate properly too. lib/solid-regions.mjs is the
// objective detector; audit offenders with `npm run gen:coloring-outlines:audit`.
//
// Every candidate must clear THREE automated gates (keep-best-of-N retry):
//   1. solidity  — scoreSolidity(candidate).passes: no solid region survives.
//   2. keep      — outlineMatch(reference, candidate): the source's thin strokes
//                  (and each old solid region's boundary) are still traced, both
//                  globally and in the worst tile. The reference is the source
//                  with solid INTERIORS whitened (lib/solid-regions.mjs
//                  whitenSolidRegions) — hollowing those out is the point, so
//                  scoring against the raw source would count the fix as drift.
//   3. reverse   — outlineMatch(candidate, reference): no invented strokes; the
//                  candidate's ink must all lie on the reference's.
//
// Candidates land in the gitignored .coloring-samples-dark/normalize/ for review;
// shipped assets are only touched with --apply, and --apply only copies a
// candidate that passed every gate. After applying, regenerate the WHOLE suite
// from the new outline (thumbs, light fill, night fill, punch) and re-review the
// contact sheet in BOTH themes — see tools/asset-gen/night-fills.md.
//
//   npm run gen:coloring-outlines:normalize -- nature/ant-tall nature/ant-wide
//   ... -- nature/ant-tall --apply             copy the passing candidate over web/static
//   ... -- nature/ant-tall --max-attempts 6    retry harder
//   ... -- nature/ant-tall --notes "keep the picnic blanket check pattern as-is"
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { alignToSource } from './lib/align-to-source.mjs';
import { scoreSolidity, whitenSolidRegions } from './lib/solid-regions.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const WEBP_QUALITY = 92;
const OUT_DIR = join(SAMPLES_DARK_DIR, 'normalize');
// The candidate's ink must all lie on the reference's (no invented strokes).
// Slightly looser than KEEP_THRESHOLD: a faithfully-traced boundary ring sits a
// hair inside the old solid's footprint, which reads as new ink to the reverse
// direction but not to the eye.
const REVERSE_KEEP_THRESHOLD = 0.9;

const INSTRUCTION = `This is a black-and-white children's COLORING PAGE — clean black outlines on a pure white background.

PROBLEM: some areas of this drawing are filled with SOLID BLACK ink — for example the pupils of eyes, or other fully-black shapes. A coloring page must be made of THIN OUTLINES ONLY, so every region can be colored in.

YOUR EDIT — convert every solid-black area into an outlined shape:
- Trace the BOUNDARY of each solid-black area with the same clean, thin black stroke used everywhere else in the drawing, exactly where the solid shape's edge is now, and leave its INSIDE pure white.
- EYES: a solid black pupil becomes an outlined pupil — a thin black circle/oval of the same size and position, white inside. If the pupil contains a white catchlight/glare dot, draw that catchlight as a small thin-outlined circle inside the outlined pupil, same size and spot.
- Do this for EVERY solid black area in the picture, large or small.

ABSOLUTE RULES:
- The finished page must contain NO solid black regions at all — every black mark on the page must be a thin stroke or outline.
- Change NOTHING else. Every line that is already a thin stroke stays exactly where it is — do not move, redraw, thicken, thin, smooth, or erase it. Keep the same composition, framing, margins, and line style.
- Do not add any new details, shapes, patterns, or decorations beyond the boundary outlines described above.
- Output only clean black line art on a pure white background — no color, no grey, no shading.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean' },
    force: { type: 'boolean' },
    notes: { type: 'string' },
    temperature: { type: 'string', short: 't' },
    'max-attempts': { type: 'string' },
  },
});
if (!positionals.length) fail('give one or more pages, e.g. "nature/ant-tall"');
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');
const baseTemp = values.temperature === undefined ? 0.3 : Number(values.temperature);
if (!(baseTemp >= 0 && baseTemp <= 2)) fail('--temperature must be between 0 and 2');
const maxAttempts = values['max-attempts'] === undefined ? 4 : Number(values['max-attempts']);
if (!(Number.isInteger(maxAttempts) && maxAttempts >= 1))
  fail('--max-attempts must be a positive integer');
const instruction = values.notes
  ? `${INSTRUCTION}\n\nPAGE-SPECIFIC NOTES:\n${values.notes}`
  : INSTRUCTION;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function editLineArt(imageBytes, temperature) {
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

// Normalize the model output back to a clean black-on-white page at the source
// resolution: grayscale, gentle contrast to whiten a faintly-grey ground and
// deepen the lines, keep antialiasing (a hard threshold would jaggy the lines
// and fail the fill generators' alignment). Same treatment as retouch-line-art.
async function cleanRender(buf, width, height) {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .linear(1.25, -18)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

const passes = (c) =>
  c.solidity.passes &&
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.reverseKeep >= REVERSE_KEEP_THRESHOLD;
// Rank imperfect attempts: a thin-stroke result is the hard requirement, then
// registration (worst tile first, like the fill generators), then reverse.
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  (c.solidity.passes ? 500 : 0) +
  c.localKeep * 200 +
  c.keep * 100 +
  c.reverseKeep * 50;

let failures = 0;
for (const arg of positionals) {
  const src = join(COLORING_DIR, `${arg}.outline.webp`);
  if (!existsSync(src)) {
    console.warn(`(skip) no line art at ${src}`);
    continue;
  }
  const source = await readFile(src);
  const { width, height } = await sharp(source).metadata();
  const srcSolidity = await scoreSolidity(source);
  if (srcSolidity.passes && !values.force) {
    console.log(
      `${arg}  already thin-stroke (biggest blob ${srcSolidity.biggestBlob}) — skipping (--force to redraw anyway)`
    );
    continue;
  }
  const reference = await whitenSolidRegions(source, srcSolidity);

  process.stdout.write(`${arg}  (blob ${srcSolidity.biggestBlob}) ... `);
  let best = null;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const temperature = Math.min(2, baseTemp + attempt * 0.15);
      const edited = await editLineArt(source, temperature);
      const resized = await cleanRender(edited, width, height);
      const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
      const candidate = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const solidity = await scoreSolidity(candidate);
      const fwd = await outlineMatch(reference, candidate);
      const rev = await outlineMatch(candidate, reference);
      const cand = {
        candidate,
        solidity,
        keep: fwd.keep,
        localKeep: fwd.localKeep,
        overlay: fwd.overlay,
        reverseKeep: rev.keep,
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

  const dest = join(OUT_DIR, `${arg}.webp`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, best.candidate);
  await sharp(best.overlay).toFile(dest.replace(/\.webp$/, '.overlay.png'));

  const ok = passes(best);
  const tries = best.attempt > 0 ? `  (${best.attempt + 1} tries)` : '';
  const nudge = best.shift.dx || best.shift.dy ? `  shift ${best.shift.dx},${best.shift.dy}` : '';
  const warn = [];
  if (!best.solidity.passes) warn.push(`still solid (blob ${best.solidity.biggestBlob})`);
  if (best.keep < KEEP_THRESHOLD) warn.push('drifting');
  if (best.localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
  if (best.reverseKeep < REVERSE_KEEP_THRESHOLD) warn.push('invented strokes');
  const stats = `blob ${srcSolidity.biggestBlob}→${best.solidity.biggestBlob}  keep ${(best.keep * 100).toFixed(1)}%  local ${(best.localKeep * 100).toFixed(1)}%  rev ${(best.reverseKeep * 100).toFixed(1)}%`;
  console.log(
    `${stats}${nudge}${tries}${warn.length ? `  ⚠ ${warn.join(' + ')}` : ''}  -> ${relative(REPO_ROOT, dest)}`
  );

  if (values.apply) {
    if (!ok) {
      failures++;
      console.log(`  ✗ NOT applied — gates unmet; review ${relative(REPO_ROOT, dest)} or retry`);
    } else {
      await writeFile(src, best.candidate);
      console.log(
        `  ✓ applied over ${relative(REPO_ROOT, src)} — regenerate its thumb + light/night fills`
      );
    }
  }
}
if (failures) fail(`${failures} page(s) did not normalize cleanly.`);
console.log('Done.');
