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
//   npm run gen:coloring-fills -- farm/dog-wide --rescore --apply
//                                                            ship the exact reviewed candidate
//   npm run gen:coloring-fills -- farm/dog-wide --samples 5    5 candidates
//   npm run gen:coloring-fills -- farm/dog-wide -t 1.2         hotter retry
//   npm run gen:coloring-fills -- farm/dog-wide --warp-max 5   reviewed override
//
// Each candidate is post-processed and scored before it's kept:
//   1. alignToSource undoes the few-pixel GLOBAL nudge the model tends to add, so
//      the colored outlines re-register onto the source. It's a single translation,
//      so it can't fix a feature that drifted on its own (step 2 catches that).
//   2. outlineMatch reports `keep` (global outline coverage) AND `localKeep` (the
//      worst grid tile's coverage) by overlaying the two outline masks. localKeep
//      is the gate that catches a localized drift a high global keep would hide.
//   3. scoreLocalWarp cross-correlates overlapping 128px edge tiles within ±12px,
//      subtracting their median vector so a residual rigid shift is not confused
//      with a feature that bent or moved on its own.
//   4. whiteFraction reports how much of the page is left pure white; big blank
//      areas would look uncolored under the child's brush, so they're rejected.
// A candidate that fails any gate is retried (temperature nudged up). Every best
// attempt is retained in review scratch, but only a passing candidate can ship,
// and reviewed bytes ship through --rescore --apply. (See lib/outline-match.mjs; the same scoring backs
// `npm run check:coloring-fill-drift`, which flags already-shipped fills.)
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
import {
  fail,
  MAX_ATTEMPTS,
  parseNonNegative,
  parsePositiveInt,
  parseTemperature,
} from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';
import { pageLevers, mergeFlags, describeLevers } from '../lib/page-notes.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
import { scoreEyeFill, judgeLightEyes } from '../lib/eye-fill.mjs';
import { punchFill } from '../lib/punch-fill.mjs';
import { FILL_PROMPT } from '../lib/prompts.mjs';
import { formatCandidateLine } from '../lib/candidate-report.mjs';
import {
  LOCAL_WARP_MAX_PX,
  LOCAL_WARP_WARN_PX,
  prepareLocalWarpSource,
  scoreLocalWarp,
} from '../lib/local-warp.mjs';

// Soft painted fills mask compression artifacts, so q90 saves bytes without visible edge damage.
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
async function generateColoredPage(ai, { imageBytes, mimeType, temperature, notes }) {
  const prompt = notes ? `${FILL_PROMPT}\n\nPAGE-SPECIFIC NOTES:\n${notes}` : FILL_PROMPT;
  return generateImage(ai, { imageBytes, mimeType, prompt, temperature });
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
const passes = (c, warpMax) =>
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.warp.localWarpMax <= warpMax &&
  c.white <= WHITE_THRESHOLD &&
  c.eyesOk;
// Rank for keeping the best of several imperfect attempts: fidelity is the hard
// constraint (global then worst-tile), then gated eyes, then less leftover white.
const rank = (c, warpMax) =>
  (passes(c, warpMax) ? 1000 : 0) +
  c.localKeep * 200 +
  (c.eyesGated && c.eyesOk ? 150 : 0) +
  (1 - c.white) * 100 +
  c.keep -
  c.warp.localWarpMax;

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      apply: { type: 'boolean' },
      rescore: { type: 'boolean' },
      samples: { type: 'string', short: 'n' },
      temperature: { type: 'string', short: 't' },
      'warp-max': { type: 'string' },
      notes: { type: 'string' },
    },
  });

  const samples = parsePositiveInt(values.samples, '--samples', 1);
  if (values.apply && samples > 1)
    fail('--apply cannot be combined with --samples greater than 1.');
  const baseTemp = parseTemperature(values.temperature, '--temperature', undefined);
  const ai = values.rescore ? null : makeClient();

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
  async function scoreCandidate(source, warpSource, colored, page, shift, attempt) {
    const [{ keep, drift, localKeep, worstTile }, warp, white, eyeScore] = await Promise.all([
      outlineMatch(source, colored),
      scoreLocalWarp(warpSource, colored),
      whiteFraction(colored),
      scoreEyeFill(colored, source),
    ]);
    const eyeVerdict = judgeLightEyes(eyeScore, { page });
    return {
      colored,
      keep,
      drift,
      localKeep,
      worstTile,
      warp,
      white,
      eyesOk: eyeVerdict.passes,
      eyesGated: eyeVerdict.gated,
      shift,
      attempt,
    };
  }

  async function renderClean(source, warpSource, width, height, slot, page, warpMax, notes) {
    let best = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const temperature = Math.min(2, baseTempForSlot(slot) + attempt * 0.15);
      const { bytes } = await generateColoredPage(ai, {
        imageBytes: source,
        mimeType: 'image/webp',
        temperature,
        notes,
      });
      // Force the colored fill back to the source's exact pixel dimensions, then
      // undo any few-pixel nudge so it registers 1:1 against the outline page.
      const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
      const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
      const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const cand = await scoreCandidate(source, warpSource, colored, page, { dx, dy }, attempt);
      if (!best || rank(cand, warpMax) > rank(best, warpMax)) best = cand;
      if (passes(cand, warpMax)) break;
    }
    const { overlay } = await outlineMatch(source, best.colored, { overlay: true });
    return { ...best, overlay };
  }

  let failures = 0;
  const passingCandidates = [];
  for (const page of pages) {
    const rel = toPosix(relative(COLORING_DIR, page).replace(/\.outline\.webp$/, ''));
    const levers = pageLevers(rel, 'light');
    const { merged, fromRegistry } = mergeFlags(values, levers);
    const warpMax = parseNonNegative(
      merged['warp-max'],
      '--warp-max',
      LOCAL_WARP_MAX_PX,
      `${rel} via notes.json`
    );
    const notes = merged.notes;
    if (levers)
      console.log(
        describeLevers({
          rel,
          levers,
          fromRegistry,
          cliValues: values,
          settings: { 'warp-max': warpMax, notes },
        })
      );
    const source = await readFile(page);
    const { width, height } = await sharp(source).metadata();
    const warpSource = await prepareLocalWarpSource(source);

    for (let i = 0; i < samples; i++) {
      const label = sampleMode ? `${rel}  sample ${i + 1}/${samples}` : rel;
      const dir = join(SAMPLES_DIR, rel);
      const out = join(dir, `sample-${i + 1}.webp`);
      if (values.rescore && !existsSync(out)) {
        failures++;
        console.log(`${label}  (skip) no candidate to rescore at ${relative(REPO_ROOT, out)}`);
        continue;
      }
      process.stdout.write(`${label} ... `);
      try {
        const cand = values.rescore
          ? await scoreCandidate(source, warpSource, await readFile(out), rel, { dx: 0, dy: 0 }, 0)
          : await renderClean(source, warpSource, width, height, i, rel, warpMax, notes);
        const { colored, keep, localKeep, white, shift, attempt } = cand;
        const overlay =
          cand.overlay ?? (await outlineMatch(source, cand.colored, { overlay: true })).overlay;
        const warn = [];
        if (keep < KEEP_THRESHOLD) warn.push('drifting');
        if (localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
        if (cand.warp.localWarpMax > warpMax) warn.push('local warp');
        else if (cand.warp.localWarpMax >= LOCAL_WARP_WARN_PX) warn.push('warp review');
        if (white > WHITE_THRESHOLD) warn.push('white');
        if (!cand.eyesGated) warn.push('eyes ungated');
        else if (!cand.eyesOk) warn.push('flat eyes');
        const score = `keep ${(keep * 100).toFixed(1)}%  local ${(localKeep * 100).toFixed(1)}%  warp ${cand.warp.localWarpMax.toFixed(1)}px  residual ${cand.warp.globalDx},${cand.warp.globalDy}  white ${(white * 100).toFixed(1)}%`;

        await mkdir(dir, { recursive: true });
        if (!values.rescore) await writeFile(out, colored);
        await sharp(overlay).toFile(join(dir, `sample-${i + 1}.overlay.png`));
        if (passes(cand, warpMax)) passingCandidates.push({ rel, colored });
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
  } else if (!sampleMode && !values.rescore) {
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
