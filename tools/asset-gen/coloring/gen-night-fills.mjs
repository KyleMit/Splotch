// Generate a DARK-THEME colored fill for coloring pages — the counterpart to
// gen-light-fills.mjs's light fills. The model's input is the page's line
// art as WHITE lines on a dark background and Gemini fills the regions with
// colors that read against the dark (a moonlit "night" coloring), so dark mode
// shows a whole separate set of renders rather than forcing a light sheet.
//
// The line-art input is the page's CHALK outline ({page}.chalk.webp — the
// dedicated dark-mode line art with deliberate solid whites, stored ink-on-white
// and negated here) when the page has one; pages that haven't forked yet fall
// back to inverting the PEN outline. With a chalk input, every registration and
// color gate scores against the chalk (it is the line art the fill must sit
// under), and the eye gate judges the SIMULATED FINAL COMPOSITE — the
// chalk-punched fill under the screened chalk over dark paper — because the
// chalk owns the eye whites and the fill only paints what survives the punch.
//
// The model sometimes DRIFTS — inventing a shape the line art doesn't have (an
// extra star, a stray dot). Because a night fill's WHITE pixels are outlines only
// (fills are saturated, background is deep navy), any white/low-chroma pixel that
// lands far from a source outline is an invented outline. scoreDrift() counts
// those; a render above the threshold is regenerated (bumping temperature) up to
// --max-attempts times, keeping the least-drifted take. Clean fills score ~0.
//
// Halo scoring punches every candidate in memory before it can be selected or
// applied. The normalized score is an automatic gate; rawScore independently
// requests crop review without rejecting deliberate mid-dark shading.
//
// The automated signals run per take with keep-best-of-N retry: scoreDrift()
// (invented outlines), scoreNightness() (a bright/daytime background), and
// scoreLineColor() (the model re-inked the white outlines DARK — they must stay
// white so they sit under the app's white "chalk" line art in dark mode), halo,
// and the two eye checks.
//
// Full workflow (generate → review proof sheet → ship → wire → verify), the prompt
// lessons, and the remaining-category checklist: tools/asset-gen/docs/pipeline.md (Stage 4).
//
// Requires GEMINI_API_KEY except in --dry-run / --rescore. Writes candidates to
// .coloring-samples-dark/ for review; --apply ships an all-passing single-take
// run and re-punches it.
//   node tools/asset-gen/coloring/gen-night-fills.mjs space               whole category
//   node tools/asset-gen/coloring/gen-night-fills.mjs space/astronaut-tall one page
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --tall         portrait pages only
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --wide         landscape pages only
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --samples 2    2 takes each
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --max-attempts 4  retry harder
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --line-white-min 150  dark-outline gate
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --rescore       re-gate saved takes offline
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --rescore --apply ship reviewed passing takes
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --dilate-lines 2  thicken white input lines
//   node tools/asset-gen/coloring/gen-night-fills.mjs space --dry-run       print each page's resolved levers (no API)
//
// Per-page levers (notes, temperature, gate overrides) auto-load from the
// fill-src/<category>/notes.json registry (lib/page-notes.mjs) so a regen starts
// from the known-good settings; explicit CLI flags always override the registry.
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
  resolveNightLineArt,
  toPosix,
} from '../lib/asset-paths.mjs';
import { fail, parseNonNegative, parsePositiveInt, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';
import { pageLevers, mergeFlags, describeLevers } from '../lib/page-notes.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
// Drift / night-mood / line-color scoring is shared with check-golden-scores.mjs so the
// committed raws can be re-scored offline with the exact generation-time math.
import {
  prepareNightFillAnalysis,
  scoreNightFillGates,
  DRIFT_THRESHOLD_DEFAULT,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';
import {
  NIGHT_HALO_RAW_REVIEW_THRESHOLD,
  NIGHT_HALO_SCORE_MAX,
  punchNightCandidate,
  scoreNightHalo,
} from '../lib/night-halo.mjs';
import { passesNightCandidate, preferNightCandidate } from '../lib/night-candidate.mjs';
// The eye gate judges the simulated FINAL render, not the raw fill: the chalk
// owns the eye whites, so only the composite shows whether an eye reads as
// white-sclera / dark-pupil / white-glint.
import { compositeNight } from '../lib/night-composite.mjs';
import { scoreEyeFill, judgeNightEyes } from '../lib/eye-fill.mjs';
// Whole-eye legibility on the composite — catches the blank white orb that the
// core-vs-annulus eye gate misses on solid-pen eyes (lib/composite-eye.mjs).
import { scoreCompositeEyes } from '../lib/composite-eye.mjs';
import { darkFillPrompt } from '../lib/prompts.mjs';
import { punchFill } from '../lib/punch-fill.mjs';

const WEBP_QUALITY = 90;

async function generateDarkPage(ai, { imageBytes, mimeType, temperature, chalked, notes }) {
  const base = darkFillPrompt(chalked);
  const prompt = notes ? `${base}\n\nPAGE-SPECIFIC NOTES:\n${notes}` : base;
  return generateImage(ai, { imageBytes, mimeType, prompt, temperature });
}

// Grow the WHITE lines by `radius` px with a separable max filter. A pale
// subject (a cream unicorn, a white pegasus) tempts the model to re-ink the
// thin outlines DARK to define the body against its own light fill; a bolder
// white band in the input is far more likely to survive as white (and gives the
// scoreLineColor gate a wider white target to sample). Runs on the negated
// grayscale line art — lossless here, since the source is black on white.
async function dilateWhiteLines(negatedBuf, radius) {
  const { data, info } = await sharp(negatedBuf)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rowMax = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const v = data[row + xx];
        if (v > m) m = v;
      }
      rowMax[row + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const v = rowMax[yy * w + x];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 1 } });
}

// Invert the black-on-white line art to white-on-dark. A plain negate yields
// white lines on pure black; nudge the floor up a touch so it reads as deep
// charcoal rather than absolute black (closer to the app's --paper dark).
// With --dilate-lines N, thicken the white lines first (see dilateWhiteLines).
async function toDarkInput(sourceBuf, dilateLines) {
  const negated = await sharp(sourceBuf).negate({ alpha: false }).toBuffer();
  const grown = dilateLines > 0 ? await dilateWhiteLines(negated, dilateLines) : sharp(negated);
  return grown.webp({ quality: WEBP_QUALITY }).toBuffer();
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean' },
    rescore: { type: 'boolean' },
    samples: { type: 'string', short: 'n' },
    temperature: { type: 'string', short: 't' },
    tall: { type: 'boolean' },
    wide: { type: 'boolean' },
    'max-attempts': { type: 'string' },
    'drift-threshold': { type: 'string' },
    'night-luma-max': { type: 'string' },
    'line-white-min': { type: 'string' },
    'halo-score-max': { type: 'string' },
    'dilate-lines': { type: 'string' },
    notes: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});
const samples = parsePositiveInt(values.samples, '--samples', 1);
if (values.apply && samples > 1) fail('--apply cannot be combined with --samples greater than 1.');

// Per-page tuning resolves in the page loop — defaults, then the page's
// fill-src/<cat>/notes.json registry entry, then explicit CLI flags (CLI wins).
function nightSettings(v, source) {
  const leverSettings = {
    temperature: parseTemperature(v.temperature, '--temperature', 0.6, source),
    'max-attempts': parsePositiveInt(v['max-attempts'], '--max-attempts', 3, source),
    'drift-threshold': parseNonNegative(
      v['drift-threshold'],
      '--drift-threshold',
      DRIFT_THRESHOLD_DEFAULT,
      source
    ),
    'night-luma-max': parseNonNegative(
      v['night-luma-max'],
      '--night-luma-max',
      NIGHT_BG_LUMA_MAX_DEFAULT,
      source
    ),
    'line-white-min': parseNonNegative(
      v['line-white-min'],
      '--line-white-min',
      LINE_WHITE_MIN_DEFAULT,
      source
    ),
    'halo-score-max': parseNonNegative(
      v['halo-score-max'],
      '--halo-score-max',
      NIGHT_HALO_SCORE_MAX,
      source
    ),
    'dilate-lines': v['dilate-lines'] === undefined ? 0 : Number(v['dilate-lines']),
    notes: v.notes,
  };
  if (!(Number.isInteger(leverSettings['dilate-lines']) && leverSettings['dilate-lines'] >= 0))
    fail(`--dilate-lines must be a non-negative integer${source ? ` (${source})` : ''}`);
  return {
    baseTemp: leverSettings.temperature,
    maxAttempts: leverSettings['max-attempts'],
    driftThreshold: leverSettings['drift-threshold'],
    nightLumaMax: leverSettings['night-luma-max'],
    lineWhiteMin: leverSettings['line-white-min'],
    haloScoreMax: leverSettings['halo-score-max'],
    dilateLines: leverSettings['dilate-lines'],
    notes: leverSettings.notes,
    leverSettings,
  };
}
nightSettings(values);
const ai = makeClient({ optional: values['dry-run'] || values.rescore });

// Generate one take, register it to the source, and score its structural
// DRIFT (invented outlines), NIGHT-ness (background too bright / daytime), LINE
// color (outlines re-inked dark instead of staying white), and EYES (every eye
// the page's light fill paints must stay lively at night — not flooded flat;
// lib/eye-fill.mjs, skipped when the page has no committed light raw to
// reference). Retry (with a rising temperature to shake loose a different
// composition) until a take passes all gates or the attempt budget runs out. A
// take is "acceptable" when its background reads as night, its outlines stayed
// white, its punched halo is at or below the automatic bar, and its eyes are
// painted. Among acceptable takes the lowest halo wins, then drift. Fallbacks
// retain the eye-first safety rule before comparing failed gates and halo.
async function generateCleanTake({
  darkInput,
  source,
  width,
  height,
  temp0,
  chalked,
  cfg,
  scoreCandidate,
}) {
  const { maxAttempts, driftThreshold } = cfg;
  let best = null;
  let attemptsRun = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsRun = attempt;
    const temperature = Math.min(2, temp0 + (attempt - 1) * 0.15);
    const { bytes } = await generateDarkPage(ai, {
      imageBytes: darkInput,
      mimeType: 'image/webp',
      temperature,
      chalked,
      notes: cfg.notes,
    });
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    // Edges are polarity-agnostic, so align the colored output to the ink-on-white
    // line-art source (chalk when forked, else pen) to undo the model's nudge.
    const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
    const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();
    const take = await scoreCandidate(colored, { dx, dy }, attempt);
    if (preferNightCandidate(take, best, cfg)) best = take;
    if (driftThreshold >= take.drift.ratio && passesNightCandidate(take, cfg)) break;
  }
  return { ...best, attemptsRun, accepted: passesNightCandidate(best, cfg) };
}

let pages = await resolveOutlineTargets(positionals, {
  includeCovers: false,
  explicitFiles: true,
  sort: 'per-target',
  defaultAll: false,
  onMissing: 'defer',
});
if (!positionals.length) fail('give a category or page, e.g. "space"');
// Optionally restrict to one orientation (e.g. generate wide fills without
// retouching already-good tall ones). --tall and --wide are mutually exclusive.
if (values.tall && values.wide) fail('pass only one of --tall / --wide');
if (values.tall) pages = pages.filter((p) => p.includes('-tall'));
if (values.wide) pages = pages.filter((p) => p.includes('-wide'));

let failures = 0;
const passingCandidates = [];
for (const page of pages) {
  const rel = toPosix(relative(COLORING_DIR, page).replace(/\.outline\.webp$/, ''));
  // Resolve this page's levers: defaults < fill-src/<cat>/notes.json < CLI.
  const levers = pageLevers(rel, 'night');
  const { merged, fromRegistry } = mergeFlags(values, levers);
  const cfg = nightSettings(merged, `${rel} via notes.json`);
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
  const pen = await readFile(page);
  const { width, height } = await sharp(pen).metadata();
  // The page's chalk outline (ink-on-white), when the fork has happened — the
  // line art dark mode actually renders, so it is both the model's input and
  // the registration/scoring reference. Un-forked pages fall back to the pen.
  const { source, chalk } = await resolveNightLineArt(page, pen);
  const darkInput = values.rescore ? null : await toDarkInput(source, cfg.dilateLines);
  // Eye reference: which nested cores the committed light fill paints as lively
  // eyes — cores keyed off the PEN outline on both sides of the comparison.
  // Absent (page has no light raw yet) the eye gate is skipped.
  const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const lightRaw = existsSync(lightRawPath) ? await readFile(lightRawPath) : null;
  const lightEyes = lightRaw ? await scoreEyeFill(lightRaw, pen) : null;
  const scoreCandidate = async (candidate, shift, attempt) => {
    const analysis = await prepareNightFillAnalysis(candidate, source);
    const [{ drift, night, line }, punched] = await Promise.all([
      scoreNightFillGates(analysis),
      punchNightCandidate(analysis),
    ]);
    const halo = await scoreNightHalo(analysis, punched);
    // Eye cores always come from the PEN outline (the chalk's solid sclera has
    // no nested rings to find); with a chalk the measured pixels are the
    // simulated final composite rather than the raw fill.
    const composite = chalk ? await compositeNight(candidate, chalk) : candidate;
    const eyeCore = lightEyes
      ? judgeNightEyes(await scoreEyeFill(composite, pen), lightEyes, { chalked: !!chalk })
      : { passes: true, failed: 0 };
    // Whole-eye check on the composite: a blank white orb where the chalk sclera
    // and the fill's catchlight stack over a solid-pen pupil. judgeNightEyes is
    // band-blind there (the annulus is solid pupil ink), so this owns that class.
    const orb =
      chalk && lightRaw
        ? await scoreCompositeEyes(composite, lightRaw, pen)
        : { passes: true, failed: 0 };
    const eyes = {
      passes: eyeCore.passes && orb.passes,
      failed: eyeCore.failed + orb.failed,
      coreFailed: eyeCore.failed,
      orbFailed: orb.failed,
      worstOrb: orb.worst ?? null,
    };
    return { candidate, ...shift, drift, night, line, halo, eyes, attempt };
  };

  for (let i = 0; i < samples; i++) {
    const label = samples > 1 ? `${rel}  ${i + 1}/${samples}` : rel;
    const dir = join(SAMPLES_DARK_DIR, dirname(rel));
    const base = rel.split('/').pop();
    const out = join(dir, samples > 1 ? `${base}.sample-${i + 1}.webp` : `${base}.webp`);
    if (values.rescore && !existsSync(out)) {
      if (values.apply) failures++;
      console.log(`${label}  (skip) no candidate to rescore at ${relative(REPO_ROOT, out)}`);
      continue;
    }
    process.stdout.write(`${label} ... `);
    try {
      const take = values.rescore
        ? {
            ...(await scoreCandidate(await readFile(out), { dx: 0, dy: 0 }, 1)),
            attemptsRun: 1,
          }
        : await generateCleanTake({
            darkInput,
            source,
            width,
            height,
            temp0: cfg.baseTemp + i * 0.12,
            chalked: !!chalk,
            cfg,
            scoreCandidate,
          });
      take.accepted = passesNightCandidate(take, cfg);
      await mkdir(dir, { recursive: true });
      if (!values.rescore) await writeFile(out, take.candidate);
      // Also stash the dark input beside it once, for the review montage.
      if (!values.rescore && i === 0)
        await sharp(darkInput).toFile(join(dir, `${base}.input.webp`));
      const nudge = take.dx || take.dy ? `  shift ${take.dx},${take.dy}` : '';
      const status = take.accepted
        ? `ok${take.attemptsRun > 1 ? `  kept attempt ${take.attempt}/${take.attemptsRun}` : ''}`
        : `kept least-bad attempt ${take.attempt}/${take.attemptsRun}`;
      const stats = `  drift ${take.drift.ratio.toFixed(4)} bgLuma ${take.night.bgLuma.toFixed(0)} lineW ${take.line.lineWhite.toFixed(0)} halo ${take.halo.haloScore.toFixed(3)} rawHalo ${take.halo.rawScore.toFixed(3)}`;
      const failed = take.accepted
        ? ''
        : (take.night.bgLuma > cfg.nightLumaMax
            ? `  night-gate FAILED (bgLuma ${take.night.bgLuma.toFixed(0)} > max ${cfg.nightLumaMax})`
            : '') +
          (take.line.lineWhite < cfg.lineWhiteMin
            ? `  line-gate FAILED (lineW ${take.line.lineWhite.toFixed(0)} < min ${cfg.lineWhiteMin})`
            : '') +
          (take.halo.haloScore > cfg.haloScoreMax
            ? `  halo-gate FAILED (halo ${take.halo.haloScore.toFixed(3)} > max ${cfg.haloScoreMax}; hotspot ${take.halo.hotspots[0]?.left ?? '-'},${take.halo.hotspots[0]?.top ?? '-'})`
            : '') +
          (take.eyes.coreFailed ? `  eye-gate FAILED (${take.eyes.coreFailed} flat eyes)` : '') +
          (take.eyes.orbFailed
            ? `  orb-gate FAILED (${take.eyes.orbFailed} blank-orb eyes, coreDark ${take.eyes.worstOrb?.coreDarkFrac})`
            : '');
      const warn =
        (take.drift.ratio > cfg.driftThreshold ? '  ⚠ still drifting' : '') +
        (take.halo.rawScore > NIGHT_HALO_RAW_REVIEW_THRESHOLD
          ? `  ⚠ crop review (rawHalo ${take.halo.rawScore.toFixed(3)} > ${NIGHT_HALO_RAW_REVIEW_THRESHOLD})`
          : '');
      console.log(`${status}${nudge}${stats}${failed}${warn}  -> ${relative(REPO_ROOT, out)}`);
      if (take.accepted) passingCandidates.push({ rel, candidate: take.candidate });
      else if (samples === 1) failures++;
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}
if (failures) fail(`${failures} render(s) failed.`);
if (values.apply) {
  for (const { rel, candidate } of passingCandidates) {
    const rawOut = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
    await mkdir(dirname(rawOut), { recursive: true });
    await writeFile(rawOut, candidate);
    const { out } = await punchFill(rawOut);
    console.log(`  ✓ applied -> ${relative(REPO_ROOT, out)}`);
  }
} else if (!values.rescore && samples === 1) {
  console.log('Review the candidate, then re-run with --apply to ship it.');
}
console.log('Done.');
