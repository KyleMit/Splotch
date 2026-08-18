// Generates a flat-color "answer key" for each black-and-white coloring page in
// web/static/coloring/ by asking Gemini to color inside the existing lines.
// The colored version keeps the page's exact black outlines and only fills the
// white regions with solid flat color, so the magic brush can pair each page
// with its colored fill and reveal the prefilled colors as a child paints.
//
// Shipping is two files per fill: the raw (lined) result is committed to
// tools/asset-gen/fill-src/ as the source of truth — the drift audit scores it —
// and its fills-only punch (outlines masked out with the line art, so the app's
// overlay is the single source of line work) is what lands in web/static/coloring/
// as the shipped .light.webp (lib/punch-fill.mjs; ADR-0043 "reveal fills only").
//
// Requires GEMINI_API_KEY. Run via npm so the .ts imports resolve:
//   npm run gen:coloring-fills                                 all pages to review scratch
//   npm run gen:coloring-fills -- creatures dinosaur           whole categories to scratch
//   npm run gen:coloring-fills -- farm/dog-wide --apply        ship a passing candidate
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
// A candidate that fails any gate is retried (temperature nudged up). Every best
// attempt is retained in review scratch, but only a passing candidate can ship,
// and shipping requires --apply. (See lib/outline-match.mjs; the same scoring backs
// `npm run check:coloring-fill-drift`, which flags already-shipped fills.)
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  REPO_ROOT,
  COLORING_DIR,
  FILL_SRC_DIR,
  SAMPLES_DIR,
  toPosix,
} from '../lib/asset-paths.mjs';
import { fail, MAX_ATTEMPTS, parsePositiveInt, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';
import { pageLevers, describeLevers } from '../lib/page-notes.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
import { scoreEyeFill, judgeLightEyes } from '../lib/eye-fill.mjs';
import { punchFill } from '../lib/punch-fill.mjs';
import { FILL_PROMPT } from '../lib/prompts.mjs';
import { formatCandidateLine } from '../lib/candidate-report.mjs';

const WEBP_QUALITY = 90;

// How `run` reports the one failure mode a caller can act on: some renders were
// rejected, none shipped. Carries the count so callers assert on the number
// rather than on the message's wording.
export class RenderFailuresError extends Error {
  constructor(failed) {
    super(`${failed} render(s) failed.`);
    this.name = 'RenderFailuresError';
    this.failed = failed;
  }
}

// Generate one flat-colored version of a coloring page. Returns raw image bytes
// + mime type, or throws with the refusal/empty reason.
async function generateColoredPage(ai, { imageBytes, mimeType, temperature }) {
  return generateImage(ai, { imageBytes, mimeType, prompt: FILL_PROMPT, temperature });
}

// Fraction of the image that is essentially pure white — a large value means big
// blank areas the child's coloring would leave looking untouched. Tiny highlights
// (eye glints, shine) stay well under the reject threshold.
const WHITE_LEVEL = 248;
// Lightweight fraction gate, intentionally independent of the registration mask resolution.
const WHITE_SCAN_SIZE = 360;
async function whiteFraction(buf) {
  const { data, info } = await sharp(buf)
    .resize(WHITE_SCAN_SIZE, WHITE_SCAN_SIZE, { fit: 'fill' })
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

// A candidate is only usable if it holds the original outline — globally AND in
// every region — and leaves no big blank-white area. Below any bar the fill either
// drifted off its outline or reads as half-uncolored, so reject and retry.
//
// KEEP is the global coverage; LOCAL_KEEP gates the WORST tile (both imported from
// lib/outline-match.mjs, shared with the auditor). A high global keep can hide a
// small feature that drifted badly: nature/ant-wide scored 93% global (over the old
// 92% bar) while its flower tile was 34% — the drift the child sees. Gating the
// worst tile is what catches that; the global bar alone never could.
const WHITE_THRESHOLD = 0.05; // >5% pure white ⇒ blank areas left uncolored

// A candidate clears if it holds the outline globally AND in its worst tile,
// isn't mostly blank white, and painted the eyes when the reviewed outline has
// a measurable eye core (lib/eye-fill.mjs).
const passes = (c) =>
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.white <= WHITE_THRESHOLD &&
  c.eyesOk;
// Rank for keeping the best of several imperfect attempts: fidelity is the hard
// constraint (global then worst-tile), then gated eyes, then less leftover white.
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  c.localKeep * 200 +
  (c.eyesGated && c.eyesOk ? 150 : 0) +
  (1 - c.white) * 100 +
  c.keep;

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      apply: { type: 'boolean' },
      samples: { type: 'string', short: 'n' },
      temperature: { type: 'string', short: 't' },
    },
  });

  const samples = parsePositiveInt(values.samples, '--samples', 1);
  if (values.apply && samples > 1)
    fail('--apply cannot be combined with --samples greater than 1.');
  const baseTemp = parseTemperature(values.temperature, '--temperature', undefined);
  const ai = makeClient();

  const pages = await resolveOutlineTargets(positionals, {
    includeCovers: false,
    explicitFiles: true,
    sort: 'per-target',
    defaultAll: true,
    onMissing: 'defer',
  });
  const sampleMode = samples > 1;

  // Colouring variety comes from sampling; the hard constraint is fidelity. Spread
  // the per-slot temperature just enough for different palettes, and nudge it on a
  // retry to escape a bad draw. Slot 0 (or single batch render) stays coolest.
  function baseTempForSlot(i) {
    if (baseTemp !== undefined) return baseTemp;
    return samples === 1 ? 0.55 : 0.55 + i * 0.12;
  }

  // Generate, size-match, re-register onto the source outline, and score one
  // candidate; retry until it passes both gates, keeping the best attempt if none
  // fully do. Returns the winning colored bytes, its scores, and its overlay.
  async function renderClean(source, width, height, slot, page) {
    let best = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const temperature = Math.min(2, baseTempForSlot(slot) + attempt * 0.15);
      const { bytes } = await generateColoredPage(ai, {
        imageBytes: source,
        mimeType: 'image/webp',
        temperature,
      });
      // Force the colored fill back to the source's exact pixel dimensions, then
      // undo any few-pixel nudge so it registers 1:1 against the outline page.
      const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
      const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
      const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const [{ keep, drift, localKeep, worstTile }, white, eyeScore] = await Promise.all([
        outlineMatch(source, colored),
        whiteFraction(colored),
        scoreEyeFill(colored, source),
      ]);
      const eyeVerdict = judgeLightEyes(eyeScore, { page });
      const cand = {
        colored,
        keep,
        drift,
        localKeep,
        worstTile,
        white,
        eyesOk: eyeVerdict.passes,
        eyesGated: eyeVerdict.gated,
        shift: { dx, dy },
        attempt,
      };
      if (!best || rank(cand) > rank(best)) best = cand;
      if (passes(cand)) break;
    }
    const { overlay } = await outlineMatch(source, best.colored, { overlay: true });
    return { ...best, overlay };
  }

  let failures = 0;
  const passingCandidates = [];
  for (const page of pages) {
    const rel = toPosix(relative(COLORING_DIR, page).replace(/\.outline\.webp$/, ''));
    // The registry's "light" entries are informational only for now — this
    // generator has no --notes / gate-override flags to merge, so a page's
    // review/why/motifs notes are printed but nothing is auto-applied
    // (lib/page-notes.mjs documents the reserved key).
    const levers = pageLevers(rel, 'light');
    if (levers)
      console.log(
        describeLevers({ rel, levers, fromRegistry: [], cliValues: values, settings: {} })
      );
    const source = await readFile(page);
    const { width, height } = await sharp(source).metadata();

    for (let i = 0; i < samples; i++) {
      const label = sampleMode ? `${rel}  sample ${i + 1}/${samples}` : rel;
      process.stdout.write(`${label} ... `);
      try {
        const cand = await renderClean(source, width, height, i, rel);
        const { colored, keep, localKeep, overlay, white, shift, attempt } = cand;
        const warn = [];
        if (keep < KEEP_THRESHOLD) warn.push('drifting');
        if (localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
        if (white > WHITE_THRESHOLD) warn.push('white');
        if (!cand.eyesGated) warn.push('eyes ungated');
        else if (!cand.eyesOk) warn.push('flat eyes');
        const score = `keep ${(keep * 100).toFixed(1)}%  local ${(localKeep * 100).toFixed(1)}%  white ${(white * 100).toFixed(1)}%`;

        const dir = join(SAMPLES_DIR, rel);
        await mkdir(dir, { recursive: true });
        const out = join(dir, `sample-${i + 1}.webp`);
        await writeFile(out, colored);
        await sharp(overlay).toFile(join(dir, `sample-${i + 1}.overlay.png`));
        if (passes(cand)) passingCandidates.push({ rel, colored });
        // Multi-sample runs are review-only (--apply is rejected above): individual
        // candidates routinely miss a gate while exploring palettes, so a gate miss
        // there must not fail the run. A thrown error below always counts.
        else if (!sampleMode) failures++;
        console.log(
          formatCandidateLine({ stats: score, warnings: warn, attempt, shift, outPath: out })
        );
      } catch (err) {
        failures++;
        console.log(`FAILED (${err instanceof Error ? err.message : err})`);
      }
    }
  }

  if (failures) throw new RenderFailuresError(failures);
  const shipped = [];
  if (values.apply) {
    for (const { rel, colored } of passingCandidates) {
      const rawOut = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
      await mkdir(dirname(rawOut), { recursive: true });
      await writeFile(rawOut, colored);
      const { out } = await punchFill(rawOut);
      shipped.push({ rel });
      console.log(`  ✓ applied -> ${relative(REPO_ROOT, out)}`);
    }
  } else if (!sampleMode) {
    console.log('Review the candidate, then re-run with --apply to ship it.');
  }
  console.log('Done.');
  return { failed: failures, shipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((err) => {
    // A RenderFailuresError is the expected "some renders were rejected" exit and
    // its message says everything; anything else is a bug, so print the error whole
    // to keep the stack.
    console.error(err instanceof RenderFailuresError ? err.message : err);
    process.exitCode = 1;
  });
}
