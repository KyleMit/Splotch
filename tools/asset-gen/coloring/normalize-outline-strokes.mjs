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
// objective detector; audit offenders with `npm run check:coloring-outline-quality`.
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
// proof sheet in BOTH themes — see tools/asset-gen/docs/pipeline.md.
//
//   npm run gen:coloring-outlines:normalize -- nature/ant-tall nature/ant-wide
//   ... -- nature/ant-tall --apply             copy the passing candidate over web/static
//   ... -- nature/ant-tall --max-attempts 6    retry harder
//   ... -- nature/ant-tall --notes "keep the picnic blanket check pattern as-is"
//   ... -- nature/ant-tall --dry-run             print resolved levers per page (no API)
//
// Per-page levers auto-load from the fill-src/<category>/notes.json registry
// (lib/page-notes.mjs); explicit CLI flags always override the registry.
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { REPO_ROOT, COLORING_DIR, SAMPLES_DARK_DIR } from '../lib/asset-paths.mjs';
import { fail, parsePositiveInt, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { pageLevers, mergeFlags, describeLevers } from '../lib/page-notes.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
import { scoreSolidity, whitenSolidRegions } from '../lib/solid-regions.mjs';
import { scoreEyeRings, scoreEyes } from '../lib/eye-fill.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import { NORMALIZE_INSTRUCTION } from '../lib/prompts.mjs';
import { formatCandidateLine } from '../lib/candidate-report.mjs';
import { rasterizeLineArt } from '../lib/line-art.mjs';

// Hard black/white edges expose WebP ringing, and downstream stages re-consume this output.
const WEBP_QUALITY = 92;
const OUT_DIR = join(SAMPLES_DARK_DIR, 'normalize');
// The candidate's ink must all lie on the reference's (no invented strokes).
// Slightly looser than KEEP_THRESHOLD: a faithfully-traced boundary ring sits a
// hair inside the old solid's footprint, which reads as new ink to the reverse
// direction but not to the eye.
const REVERSE_KEEP_THRESHOLD = 0.9;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean' },
    force: { type: 'boolean' },
    notes: { type: 'string' },
    temperature: { type: 'string', short: 't' },
    'max-attempts': { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});
if (!positionals.length) fail('give one or more pages, e.g. "nature/ant-tall"');
const ai = makeClient({ optional: values['dry-run'] });

// Per-page tuning resolves in the page loop — defaults, then the page's
// fill-src/<cat>/notes.json registry entry, then explicit CLI flags (CLI wins).
function normalizeSettings(v, source) {
  const leverSettings = {
    temperature: parseTemperature(v.temperature, '--temperature', 0.3, source),
    'max-attempts': parsePositiveInt(v['max-attempts'], '--max-attempts', 4, source),
    notes: v.notes,
  };
  const instruction = leverSettings.notes
    ? `${NORMALIZE_INSTRUCTION}\n\nPAGE-SPECIFIC NOTES:\n${leverSettings.notes}`
    : NORMALIZE_INSTRUCTION;
  return {
    baseTemp: leverSettings.temperature,
    maxAttempts: leverSettings['max-attempts'],
    notes: leverSettings.notes,
    instruction,
    leverSettings,
  };
}
normalizeSettings(values);

async function editLineArt(imageBytes, temperature, instruction) {
  const { bytes } = await generateImage(ai, {
    imageBytes,
    mimeType: 'image/webp',
    prompt: instruction,
    temperature,
  });
  return bytes;
}

// Normalize the model output back to a clean black-on-white page at the source
// resolution: grayscale, gentle contrast to whiten a faintly-grey ground and
// deepen the lines, keep antialiasing (a hard threshold would jaggy the lines
// and fail the fill generators' alignment).
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
  c.rings.passes &&
  c.eyesPreserved &&
  c.keep >= KEEP_THRESHOLD &&
  c.localKeep >= LOCAL_KEEP_THRESHOLD &&
  c.reverseKeep >= REVERSE_KEEP_THRESHOLD;
// Rank imperfect attempts: a thin-stroke, sanely-ringed, eyes-intact result is
// the hard requirement, then registration (worst tile first, like the fill
// generators), then reverse.
const rank = (c) =>
  (passes(c) ? 1000 : 0) +
  (c.solidity.passes ? 500 : 0) +
  (c.eyesPreserved ? 400 : 0) +
  (c.rings.passes ? 300 : 0) +
  c.localKeep * 200 +
  c.keep * 100 +
  c.reverseKeep * 50;

// Every eye in the source must still exist in the candidate. Eyes are where
// the redraws work hardest, and the registration gates can't guarantee this:
// whitened eye interiors are exempt from drift scoring by design, and a thin
// eyeball ring is too few pixels to sink a tile — a low-temperature caterpillar
// redraw deleted a whole eye and still scored 99.7% locally. Cluster the
// source's eye cores (same radius as lib/eye-fill.mjs) and require a candidate
// core near each cluster's center.
const EYE_MATCH_DIST = 45;
function eyesPreserved(srcCores, candCores) {
  const clusters = [];
  for (const c of srcCores) {
    const x = (c.minX + c.maxX) / 2;
    const y = (c.minY + c.maxY) / 2;
    const hit = clusters.find((k) => Math.hypot(k.x - x, k.y - y) <= EYE_MATCH_DIST);
    if (hit) {
      hit.x = (hit.x + x) / 2;
      hit.y = (hit.y + y) / 2;
    } else clusters.push({ x, y });
  }
  return clusters.every((k) =>
    candCores.some(
      (c) => Math.hypot((c.minX + c.maxX) / 2 - k.x, (c.minY + c.maxY) / 2 - k.y) <= EYE_MATCH_DIST
    )
  );
}

let failures = 0;
for (const arg of positionals) {
  // Resolve this page's levers: defaults < fill-src/<cat>/notes.json < CLI.
  const levers = pageLevers(arg, 'normalize');
  const { merged, fromRegistry } = mergeFlags(values, levers);
  const cfg = normalizeSettings(merged, `${arg} via notes.json`);
  if (levers || values['dry-run'])
    console.log(
      describeLevers({
        rel: arg,
        levers,
        fromRegistry,
        cliValues: values,
        settings: cfg.leverSettings,
      })
    );
  if (values['dry-run']) continue;
  const src = join(COLORING_DIR, `${arg}.overlay.svg`);
  if (!existsSync(src)) {
    console.warn(`(skip) no line art at ${src}`);
    continue;
  }
  const source = await rasterizeLineArt(src);
  const { width, height } = await sharp(source).metadata();
  const sourceAnalysis = await prepareOutlineAnalysis(source);
  const srcSolidity = await scoreSolidity(sourceAnalysis);
  if (srcSolidity.passes && !values.force) {
    const srcRings = await scoreEyeRings(sourceAnalysis);
    if (srcRings.passes) {
      console.log(
        `${arg}  already thin-stroke (biggest blob ${srcSolidity.biggestBlob}, ring depth ${srcRings.maxDepth}) — skipping (--force to redraw anyway)`
      );
      continue;
    }
  }
  const { cores: srcCores, rings: srcRings } = await scoreEyes(sourceAnalysis);
  // An over-ringed eye's interior is REPLACEABLE (the redraw simplifies it to
  // one pupil + one catchlight), so clear it on BOTH sides of the registration
  // scoring — from the reference for the same reason solid interiors are
  // whitened (removing the extra rings is the point, not drift), and from the
  // candidate before the reverse pass (the replacement pupil isn't invented
  // ink). The outer eyeball ring survives the 4px bbox inset on each side and
  // must still be traced.
  const whitenEyeInteriors = (buf) => {
    const inset = 4;
    return sharp(buf)
      .composite(
        srcRings.overDeep.map(({ outer }) => ({
          input: {
            create: {
              width: Math.max(1, outer.maxX - outer.minX - 2 * inset),
              height: Math.max(1, outer.maxY - outer.minY - 2 * inset),
              channels: 3,
              background: { r: 255, g: 255, b: 255 },
            },
          },
          left: outer.minX + inset,
          top: outer.minY + inset,
        }))
      )
      .png()
      .toBuffer();
  };
  let reference = await whitenSolidRegions(source, srcSolidity);
  if (srcRings.overDeep.length) reference = await whitenEyeInteriors(reference);

  const srcEyeCores = srcCores.cores;

  process.stdout.write(
    `${arg}  (blob ${srcSolidity.biggestBlob}, rings ${srcRings.maxDepth}) ... `
  );
  let best = null;
  let overlay;
  try {
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      const temperature = Math.min(2, cfg.baseTemp + attempt * 0.15);
      const edited = await editLineArt(source, temperature, cfg.instruction);
      const resized = await cleanRender(edited, width, height);
      const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
      const candidate = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const candidateAnalysis = await prepareOutlineAnalysis(candidate);
      const solidity = await scoreSolidity(candidateAnalysis);
      const { cores, rings } = await scoreEyes(candidateAnalysis);
      const fwd = await outlineMatch(reference, candidate);
      const revCandidate = srcRings.overDeep.length
        ? await whitenEyeInteriors(candidate)
        : candidate;
      const rev = await outlineMatch(revCandidate, reference);
      const cand = {
        candidate,
        solidity,
        rings,
        eyesPreserved: eyesPreserved(srcEyeCores, cores.cores),
        keep: fwd.keep,
        localKeep: fwd.localKeep,
        reverseKeep: rev.keep,
        shift: { dx, dy },
        attempt,
      };
      if (!best || rank(cand) > rank(best)) best = cand;
      if (passes(cand)) break;
    }
    ({ overlay } = await outlineMatch(reference, best.candidate, { overlay: true }));
  } catch (err) {
    failures++;
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    continue;
  }

  const dest = join(OUT_DIR, `${arg}.webp`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, best.candidate);
  await sharp(overlay).toFile(dest.replace(/\.webp$/, '.overlay.png'));

  const ok = passes(best);
  const warn = [];
  if (!best.solidity.passes) warn.push(`still solid (blob ${best.solidity.biggestBlob})`);
  if (!best.rings.passes) warn.push(`over-ringed (depth ${best.rings.maxDepth})`);
  if (!best.eyesPreserved) warn.push('an eye went missing');
  if (best.keep < KEEP_THRESHOLD) warn.push('drifting');
  if (best.localKeep < LOCAL_KEEP_THRESHOLD) warn.push('local drift');
  if (best.reverseKeep < REVERSE_KEEP_THRESHOLD) warn.push('invented strokes');
  const stats = `blob ${srcSolidity.biggestBlob}→${best.solidity.biggestBlob}  keep ${(best.keep * 100).toFixed(1)}%  local ${(best.localKeep * 100).toFixed(1)}%  rev ${(best.reverseKeep * 100).toFixed(1)}%`;
  console.log(
    formatCandidateLine({
      stats,
      warnings: warn,
      attempt: best.attempt,
      shift: best.shift,
      outPath: dest,
    })
  );

  if (values.apply) {
    if (!ok) {
      failures++;
      console.log(`  ✗ NOT applied — gates unmet; review ${relative(REPO_ROOT, dest)} or retry`);
    } else {
      const authoringSource = join(
        REPO_ROOT,
        'vectorized',
        'coloring-overlays',
        `${arg}.source.webp`
      );
      await mkdir(dirname(authoringSource), { recursive: true });
      await writeFile(authoringSource, best.candidate);
      console.log(
        `  ✓ staged ${relative(REPO_ROOT, authoringSource)} — vectorize it, then regenerate light/night fills`
      );
    }
  }
}
if (failures) fail(`${failures} page(s) did not normalize cleanly.`);
console.log('Done.');
