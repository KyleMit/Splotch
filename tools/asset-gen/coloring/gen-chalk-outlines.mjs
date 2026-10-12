// Generate a page or cover's CHALK OUTLINE — the dedicated dark-mode line art
// that forks from the canonical light line art (the pen, *.overlay.svg).
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
// STORAGE POLARITY: scoring rasterizes both SVG themes as ink-on-white. A page
// apply stages a raster trace source; the canonical dark SVG bakes white runtime
// ink. Transitional cover chalk remains ink-on-white WebP until its vector pass.
//
// Gates per candidate (keep-best-of-N with a rising temperature ladder):
//   1. keep/localKeep — outlineMatch(reference, candidate) where the reference
//      is the pen with its SOLID INTERIORS whitened out (rim kept — the same
//      exemption normalize-outline-strokes.mjs grants its redraws): every pen
//      STROKE is still traced, globally and in the worst tile. A solid pen
//      pupil is exactly what the chalk is supposed to whiten into sclera +
//      outlined pupil, so scoring against the raw pen read that deliberate
//      whitening as lost ink — 19 of the 2026-07 catalog's 94 shipped chalks
//      failed this gate for no other reason and had to ship by hand-cp.
//   2. enclosure — new ink is judged by WHERE it lands, not how thick it is:
//      inside a pen-bounded interior it's a deliberate whitening (a sclera is a
//      thin annulus — thickness tests misread it); on the open background
//      (flood-reachable from the border) it's an invented shape and fails.
//   3. white budget — total whitened area stays a small share of the page.
//   4. regional ink diff — within each pen-bounded region, new chalk ink and
//      chalk retained inside solid-pen cores may not exceed the reviewed
//      shipped chalk's allowance (or the default on a new page).
//   5. eye polarity — pen eye cores the light raw paints DARK (pupils) must
//      stay non-ink (fillable); cores it paints BRIGHT (catchlights) should be
//      chalk ink (warns only). Skipped when the page has no light raw.
//
// Candidates land in .coloring-samples-dark/chalk/ (with a .display.webp preview
// of what dark mode will show); shipped assets are only touched with --apply,
// and --apply only copies a candidate that passed every gate. After applying,
// regenerate the page's night fill from the chalk and re-punch.
//
//   npm run gen:coloring-chalk -- nature                    whole category
//   npm run gen:coloring-chalk -- nature/ant-tall --apply   ship the passing candidate
//   npm run gen:coloring-chalk -- nature/cover --apply      ship one book cover
//   ... --max-attempts 6  -t 0.5  --notes "…"  --force      the usual levers
//   ... --ink-diff-max 80                                   reviewed new-white allowance
//   ... --dry-run                                           print resolved levers per page (no API)
//
// Per-page levers auto-load from the fill-src/<category>/notes.json registry
// (lib/page-notes.mjs); explicit CLI flags always override the registry.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import sharp from 'sharp';
import {
  REPO_ROOT,
  COLORING_DIR,
  FILL_SRC_DIR,
  SAMPLES_DARK_DIR,
  toPosix,
} from '../lib/asset-paths.mjs';
import { fail, parseNonNegative, parsePositiveInt, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { darkLineArtPath, lineArtStem, rasterizeLineArt } from '../lib/line-art.mjs';
import { resolveLineArtTargets } from '../lib/line-art-targets.mjs';
import { pageLevers, mergeFlags, describeLevers, withPageNotes } from '../lib/page-notes.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
import { crispInk } from '../lib/crisp-ink.mjs';
import { scoreEyeFill, EYE_DARK_MAX, EYE_LIGHT_MIN } from '../lib/eye-fill.mjs';
import { scoreSolidity, whitenSolidRegions } from '../lib/solid-regions.mjs';
import { CHALK_INSTRUCTION } from '../lib/prompts.mjs';
import { formatCandidateLine } from '../lib/candidate-report.mjs';
import {
  CHALK_INK_DIFF_MAX_DEFAULT,
  prepareChalkInkDiff,
  scoreChalkInkDiff,
} from '../lib/chalk-ink-diff.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';

// Hard black/white edges expose WebP ringing, and downstream stages re-consume this output.
const WEBP_QUALITY = 92;
const OUT_DIR = join(SAMPLES_DARK_DIR, 'chalk');

// New ink on the open background beyond this share of the pen's ink mass = an
// invented shape (a clean chalk reads ~0).
const INVENTED_MAX_DEFAULT = 0.01;
// Total whitened share of the page a chalk may claim (eyes/teeth/markings are
// small; a whole white body is a review-worthy surprise).
const WHITE_FRAC_MAX_DEFAULT = 0.1;

// Eye polarity: the chalk must whiten the eye's WHITES and leave its PUPILS
// fillable. Which core is which comes from the committed light raw — a core
// the light fill paints near-black (a pupil disc) must stay NON-INK in the
// chalk so the night fill can paint it (the first spider/caterpillar chalks
// whitened whole eyeballs, pupils included, and the composite eye gate caught
// it only after a night fill was burned). A core the light fill paints bright
// (a catchlight interior) should be chalk ink — solid white at night — but
// that misfire is survivable, so it only warns.
function judgeChalkEyes(chalkScored, lightScored) {
  let pupilsInked = 0;
  let whitesMissed = 0;
  for (let i = 0; i < lightScored.cores.length; i++) {
    const ref = lightScored.cores[i];
    const chalkCore = chalkScored.cores[i];
    if (!ref || !chalkCore) continue;
    if (ref.coreLuma <= EYE_DARK_MAX && chalkCore.coreLuma < EYE_LIGHT_MIN) pupilsInked++;
    if (ref.coreLuma >= 180 && chalkCore.coreLuma > EYE_DARK_MAX) whitesMissed++;
  }
  return { passes: pupilsInked === 0, pupilsInked, whitesMissed };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean' },
    force: { type: 'boolean' },
    rescore: { type: 'boolean' },
    notes: { type: 'string' },
    temperature: { type: 'string', short: 't' },
    'max-attempts': { type: 'string' },
    'invented-max': { type: 'string' },
    'white-frac-max': { type: 'string' },
    'ink-diff-max': { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});
if (!positionals.length)
  fail('give one or more pages or categories, e.g. "nature/ant-tall" or "nature"');
// --rescore re-runs the gates over the existing candidates in the samples dir
// (no API calls) — for re-judging after a gate change without burning takes.
const ai = makeClient({ optional: values['dry-run'] || values.rescore });

// Per-page tuning resolves in the page loop — defaults, then the page's
// fill-src/<cat>/notes.json registry entry, then explicit CLI flags (CLI wins).
function chalkSettings(v, source) {
  const leverSettings = {
    temperature: parseTemperature(v.temperature, '--temperature', 0.35, source),
    'max-attempts': parsePositiveInt(v['max-attempts'], '--max-attempts', 4, source),
    'invented-max': parseNonNegative(
      v['invented-max'],
      '--invented-max',
      INVENTED_MAX_DEFAULT,
      source
    ),
    'white-frac-max': parseNonNegative(
      v['white-frac-max'],
      '--white-frac-max',
      WHITE_FRAC_MAX_DEFAULT,
      source
    ),
    'ink-diff-max': parseNonNegative(
      v['ink-diff-max'],
      '--ink-diff-max',
      CHALK_INK_DIFF_MAX_DEFAULT,
      source
    ),
    notes: v.notes,
  };
  const instruction = withPageNotes(CHALK_INSTRUCTION, leverSettings.notes);
  return {
    baseTemp: leverSettings.temperature,
    maxAttempts: leverSettings['max-attempts'],
    inventedMax: leverSettings['invented-max'],
    whiteFracMax: leverSettings['white-frac-max'],
    inkDiffMax: leverSettings['ink-diff-max'],
    inkDiffMaxOverridden: v['ink-diff-max'] !== undefined,
    notes: leverSettings.notes,
    instruction,
    leverSettings,
  };
}
chalkSettings(values);

async function drawChalk(imageBytes, temperature, instruction) {
  const { bytes } = await generateImage(ai, {
    imageBytes,
    mimeType: 'image/webp',
    prompt: instruction,
    temperature,
  });
  return bytes;
}

// Model output (white-on-black) -> stored ink polarity at source resolution:
// grayscale, negate, then crisp the edges (lib/crisp-ink.mjs). The pen tools'
// gentle linear contrast is not enough here — on the dark board the invert +
// screen render and the binary night punch turn any soft antialias ramp or
// faint grey ground into a ring of dark specks around every line.
async function toInkPolarity(buf, width, height) {
  const negated = await sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .negate()
    .toBuffer();
  return sharp(await crispInk(negated))
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

const passes = (c, cfg) =>
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.newInk.inventedRatio <= cfg.inventedMax &&
  c.newInk.whiteFrac <= cfg.whiteFracMax &&
  c.newInk.passes &&
  c.eyes.passes;
const rank = (c, cfg) =>
  (passes(c, cfg) ? 1000 : 0) +
  (c.eyes.passes ? 500 : 0) +
  (c.newInk.inventedRatio <= cfg.inventedMax ? 300 : 0) +
  (c.newInk.passes ? 200 : 0) +
  c.localKeep * 200 +
  c.keep * 100 -
  c.eyes.whitesMissed * 10;

const pages = await resolveLineArtTargets(positionals, {
  includeCovers: true,
  explicitFiles: true,
  sort: 'per-target',
  defaultAll: false,
  onMissing: 'defer',
});

let failures = 0;
for (const page of pages) {
  const rel = toPosix(lineArtStem(relative(COLORING_DIR, page)));
  const isCover = rel.endsWith('/cover');
  // Resolve this page's levers: defaults < fill-src/<cat>/notes.json < CLI.
  const levers = pageLevers(rel, 'chalk');
  const { merged, fromRegistry } = mergeFlags(values, levers);
  const cfg = chalkSettings(merged, `${rel} via notes.json`);
  if (levers || values['dry-run'])
    console.log(
      describeLevers({
        rel,
        levers,
        fromRegistry,
        cliValues: values,
        settings: cfg.leverSettings,
      })
    );
  if (values['dry-run']) continue;
  if (!existsSync(page)) {
    console.warn(`(skip) no line art at ${page}`);
    continue;
  }
  const dest = darkLineArtPath(page);
  if (existsSync(dest) && !values.force && !values.apply && !values.rescore) {
    console.log(`${rel}  chalk already shipped — skipping (--force to redraw)`);
    continue;
  }
  const pen = await rasterizeLineArt(page);
  const penAnalysis = await prepareOutlineAnalysis(pen);
  // Keep-gate reference: whiten the pen's solid interiors (keeping a boundary
  // rim) so the chalk's deliberate whitening of a solid pupil doesn't score as
  // lost ink. Enclosure/white-budget/eye gates still judge against the raw pen.
  const penSolidity = await scoreSolidity(penAnalysis);
  const keepReference = penSolidity.solidPx ? await whitenSolidRegions(pen, penSolidity) : pen;
  const { width, height } = await sharp(pen).metadata();
  const displayInput = await sharp(pen)
    .negate({ alpha: false })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  process.stdout.write(`${rel} ... `);
  const sample = join(OUT_DIR, `${rel}.webp`);
  // Eye-polarity reference: which pen eye cores the committed light fill paints
  // dark (pupils — must stay fillable) vs bright (whites — should be chalked).
  const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const lightEyes = existsSync(lightRawPath)
    ? await scoreEyeFill(await readFile(lightRawPath), penAnalysis)
    : null;
  const inkAnalysis = await prepareChalkInkDiff(penAnalysis);
  const approvedInk = existsSync(dest)
    ? await scoreChalkInkDiff(await rasterizeLineArt(dest), inkAnalysis)
    : null;
  const score = async (candidate, shift, attempt) => {
    const fwd = await outlineMatch(keepReference, candidate);
    const newInk = await scoreChalkInkDiff(candidate, inkAnalysis, {
      baseline: approvedInk,
      ...(cfg.inkDiffMaxOverridden ? { maxInkPx: cfg.inkDiffMax } : {}),
    });
    const eyes = lightEyes
      ? judgeChalkEyes(await scoreEyeFill(candidate, penAnalysis), lightEyes)
      : { passes: true, pupilsInked: 0, whitesMissed: 0 };
    return {
      candidate,
      keep: fwd.keep,
      localKeep: fwd.localKeep,
      newInk,
      eyes,
      shift,
      attempt,
    };
  };
  let best = null;
  let overlay;
  try {
    if (values.rescore) {
      if (!existsSync(sample)) {
        console.log(`(skip) no candidate to rescore at ${relative(REPO_ROOT, sample)}`);
        continue;
      }
      best = await score(await readFile(sample), { dx: 0, dy: 0 }, 0);
    } else {
      for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
        const temperature = Math.min(2, cfg.baseTemp + attempt * 0.15);
        const drawn = await drawChalk(displayInput, temperature, cfg.instruction);
        const inked = await toInkPolarity(drawn, width, height);
        const { buffer: aligned, dx, dy } = await alignToSource(inked, pen, width, height);
        const cand = await score(
          await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer(),
          { dx, dy },
          attempt
        );
        if (!best || rank(cand, cfg) > rank(best, cfg)) best = cand;
        if (passes(cand, cfg)) break;
      }
    }
    ({ overlay } = await outlineMatch(keepReference, best.candidate, { overlay: true }));
  } catch (err) {
    failures++;
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    continue;
  }

  await mkdir(dirname(sample), { recursive: true });
  await writeFile(sample, best.candidate);
  // What dark mode will actually show — the negation — for human review.
  await sharp(best.candidate)
    .negate({ alpha: false })
    .webp({ quality: WEBP_QUALITY })
    .toFile(sample.replace(/\.webp$/, '.display.webp'));
  await sharp(overlay).toFile(sample.replace(/\.webp$/, '.overlay.png'));

  const ok = passes(best, cfg);
  const warn = [];
  if (best.keep < KEEP_THRESHOLD) warn.push('drifting');
  if (best.localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
  if (best.newInk.inventedRatio > cfg.inventedMax) warn.push('invented shapes on the background');
  if (best.newInk.whiteFrac > cfg.whiteFracMax) warn.push('over-whitened');
  if (!best.newInk.passes)
    warn.push(`new interior ink (${best.newInk.flaggedRegions.length} regions)`);
  if (!best.eyes.passes) warn.push(`pupils whitened (${best.eyes.pupilsInked})`);
  if (best.eyes.whitesMissed) warn.push(`eye whites not chalked (${best.eyes.whitesMissed})`);
  const stats = `keep ${(best.keep * 100).toFixed(1)}%  local ${(best.localKeep * 100).toFixed(1)}%  white ${(best.newInk.whiteFrac * 100).toFixed(1)}%  ink ${best.newInk.addedInkPx}/${best.newInk.solidInkPx}px  invented ${best.newInk.inventedRatio.toFixed(4)}`;
  console.log(
    formatCandidateLine({
      stats,
      warnings: warn,
      attempt: best.attempt,
      shift: best.shift,
      outPath: sample,
    })
  );

  if (values.apply) {
    if (!ok) {
      failures++;
      console.log(`  ✗ NOT applied — gates unmet; review ${relative(REPO_ROOT, sample)} or retry`);
    } else {
      const source = join(REPO_ROOT, 'vectorized', 'coloring-dark-overlays', `${rel}.source.webp`);
      await mkdir(dirname(source), { recursive: true });
      await writeFile(source, best.candidate);
      console.log(
        `  ✓ staged ${relative(REPO_ROOT, source)} — vectorize it, then ${isCover ? 'regenerate its cover thumbnail' : 'regenerate its night fill + re-punch'}`
      );
    }
  }
}
if (failures) fail(`${failures} page(s) did not chalk cleanly.`);
console.log('Done.');
