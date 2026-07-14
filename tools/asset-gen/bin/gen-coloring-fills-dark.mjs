// Generate a DARK-THEME colored fill for coloring pages — the counterpart to
// gen-coloring-fills.mjs's light fills. The model's input is the page's line
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
// Three automated gates run per take, each with keep-best-of-N retry: scoreDrift()
// (invented outlines), scoreNightness() (a bright/daytime background), and
// scoreLineColor() (the model re-inked the white outlines DARK — they must stay
// white so they sit under the app's white "chalk" line art in dark mode).
//
// Full workflow (generate → review contact sheet → ship → wire → verify), the prompt
// lessons, and the remaining-category checklist: tools/asset-gen/docs/pipeline.md (Stage 4).
//
// Requires GEMINI_API_KEY. Writes candidates to .coloring-samples-dark/ for
// review — it does NOT touch the shipped assets.
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space               whole category
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space/astronaut-tall one page
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --tall         portrait pages only
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --wide         landscape pages only
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --samples 2    2 takes each
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --max-attempts 4  retry harder
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --line-white-min 150  dark-outline gate
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --dilate-lines 2  thicken white input lines
//   node tools/asset-gen/bin/gen-coloring-fills-dark.mjs space --dry-run       print each page's resolved levers (no API)
//
// Per-page levers (notes, temperature, gate overrides) auto-load from the
// fill-src/<category>/notes.json registry (lib/page-notes.mjs) so a regen starts
// from the known-good settings; explicit CLI flags always override the registry.
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { REPO_ROOT, COLORING_DIR, FILL_SRC_DIR, SAMPLES_DARK_DIR, fail } from '../lib/paths.mjs';
import { pageLevers, mergeFlags, describeLevers } from '../lib/page-notes.mjs';
import { alignToSource } from '../lib/align-to-source.mjs';
// Drift / night-mood / line-color scoring is shared with audit-golden.mjs so the
// committed raws can be re-scored offline with the exact generation-time math.
import {
  scoreDrift,
  scoreNightness,
  scoreLineColor,
  DRIFT_THRESHOLD_DEFAULT,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';
// The eye gate judges the simulated FINAL render, not the raw fill: the chalk
// owns the eye whites, so only the composite shows whether an eye reads as
// white-sclera / dark-pupil / white-glint.
import { compositeNight } from '../lib/night-composite.mjs';
import { scoreEyeFill, judgeNightEyes } from '../lib/eye-fill.mjs';
// Whole-eye legibility on the composite — catches the blank white orb that the
// core-vs-annulus eye gate misses on solid-pen eyes (lib/composite-eye.mjs).
import { scoreCompositeEyes } from '../lib/composite-eye.mjs';
import { classifyGeminiResponse } from '../../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-3.1-flash-image';
const OUT_DIR = SAMPLES_DARK_DIR;
const WEBP_QUALITY = 90;

// The eye instruction depends on the line-art input. A plain inverted PEN
// outline has ringed eyes the fill must paint in three tones; a CHALK outline
// already carries the whites (solid sclera + catchlight), so the fill's only
// eye job is a deep dark pupil — and it must leave the chalk whites alone.
const EYES_RINGED = `- EYES — FILL EVERY RING: an eye in this drawing is NESTED OUTLINED CIRCLES — an eyeball, a pupil circle inside it, and a tiny catchlight circle inside the pupil. Each circle's inside is a REGION TO FILL like any other region, never a ring left sitting on one flat color. Paint the eyeball's inside a LIGHT OFF-WHITE, the pupil circle's inside a DEEP NEAR-BLACK (very dark brown or near-black navy), and the tiny catchlight circle's inside BRIGHT WHITE. The finished eye must show three clearly different tones — light eyeball, dark pupil, white glint — so it reads as a lively cartoon eye. An eye where the eyeball, pupil, and catchlight all came out the same color (all dark, or all light) is WRONG and unusable — in dark mode YOUR pixels are the eye the child sees.`;
const EYES_CHALKED = `- EYES — THE WHITES ARE ALREADY PAINTED: each eye's white (the sclera) and its tiny catchlight dot are already SOLID WHITE in the drawing — they are chalk, part of the line-art layer. Keep every solid white area PURE BRIGHT WHITE — never repaint, tint, dim, shade, or color over it. The PUPIL is the dark region inside the white sclera: fill it a DEEP NEAR-BLACK (very dark brown or near-black navy), so the finished eye reads white sclera / dark pupil / white glint.`;

// The input handed to the model is the line art as WHITE marks on a near-black
// ground (the chalk outline as-displayed, or the inverted pen outline). The
// prompt asks it to keep those white marks and fill the regions with colors
// that read on dark — the "answer key" for a dark theme.
const darkFillPrompt = (
  chalked
) => `You are given a toddler coloring-book page drawn as WHITE ${chalked ? 'chalk — thin outlines plus a few deliberate SOLID WHITE areas (eye whites, catchlight dots, small white markings) — ' : 'outlines '}on a dark background. Color it in as a cozy NIGHT-TIME / EVENING scene — as if the whole picture is happening at dusk or after dark, softly lit by moonlight.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every WHITE outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The outlines must stay white and pixel-for-pixel identical to the original.${chalked ? '\n- Keep every SOLID WHITE area exactly as it is — same shape, same place, PURE BRIGHT WHITE. The solid whites are chalk line-art, not regions to color.' : ''}
- THE OUTLINES ARE WHITE AND MUST STAY BRIGHT WHITE. This is a white-line drawing on a dark ground, NOT a normal black-outline coloring page. NEVER turn the outlines black, dark, grey, brown, or any dark color. NEVER trace, re-ink, or redraw the shapes with dark or black lines. Every outline that is white in the input must still be a bright white line in your output. A picture with dark outlines is WRONG and unusable — the lines must glow white against the dark fills.
- Do not add any new lines, outlines, stars, dots, details, decorations, patterns, textures, letters, or objects. Only add color to the regions that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

THIS IS A NIGHT / EVENING SCENE — the whole point:
- The picture must clearly read as taking place at NIGHT or in the EVENING — dusk, twilight, moonlit, after dark — NOT in bright daylight. A daytime subject (a sunny leaf, a blue-sky day) must simply look like it is now night-time.
- The BACKGROUND and every large open or empty area must be a DEEP EVENING-SKY tone: midnight blue, deep indigo, dark twilight purple, or deep navy. It does NOT have to be pitch black — a deep dusk is fine — but it must be DARK and DIM.
- Do NOT paint the background a bright or light "SKY BLUE" / daytime blue, and do NOT make it white, grey, or any pale or bright color. When in doubt, go darker and deeper.

COLORING STYLE — a dim, moonlit night palette:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no crayon or paint texture.
- Colors stay deep and moonlit, but they are still the subject's OWN NATURAL colors — just dimmed and cooled by moonlight, not swapped out. A few GLOWING accent colors (warm gold, amber, teal, magenta) can pop as if lit by the moon, fireflies, or a lantern, while the overall scene stays dim and evening-lit — deep, not bright and sunny.
- FACES, SKIN, and ANIMAL BODIES must keep a NATURAL, living color — never grey, ashen, ghostly, chalky, or washed-out slate. Give a person a real SKIN TONE (a warm tan, brown, peach, or golden-brown, only darkened for night); give an animal its real coloring (a green caterpillar, a yellow-and-black bee, a red ladybug), softened toward evening. A face must look like living skin or fur under moonlight, NOT like a pale ghost.
- Only things that have no real color of their own — a cloud, a water droplet, a wisp of steam, a puff of smoke, the glow of a star — may take a soft, dim, moonlit off-white or pale tint. Everything else keeps its own (dimmed) color.
${chalked ? EYES_CHALKED : EYES_RINGED}
- Do NOT use pure or bright WHITE fills elsewhere, and avoid bright daytime colors (bright sky blue, bright grass green). Deepen and cool every color toward evening. The only pure-white pixels allowed are the ${chalked ? 'white chalk marks already in the drawing — the outlines and the solid white areas' : 'outlines themselves, the eye-whites, and tiny eye glints'}.
- Keep the WHITE outlines fully visible — every fill should butt right up against the white outline without covering it.

Convey the night mood with COLOR AND MOOD ONLY. Do NOT add a moon, stars, fireflies, lamps, or any new shapes or lines — only the outlines already present may be colored.

The result must look like the identical white-line drawing, recolored as a cozy, dim, moonlit NIGHT-TIME scene on a deep dark evening background — never a bright daytime picture.`;

async function generateDarkPage(ai, { imageBytes, mimeType, temperature, chalked, notes }) {
  const base = darkFillPrompt(chalked);
  const prompt = notes ? `${base}\n\nPAGE-SPECIFIC NOTES:\n${notes}` : base;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(imageBytes).toString('base64') } },
          { text: prompt },
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

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string', short: 'n' },
    temperature: { type: 'string', short: 't' },
    tall: { type: 'boolean' },
    wide: { type: 'boolean' },
    'max-attempts': { type: 'string' },
    'drift-threshold': { type: 'string' },
    'night-luma-max': { type: 'string' },
    'line-white-min': { type: 'string' },
    'dilate-lines': { type: 'string' },
    notes: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});
const samples = values.samples === undefined ? 1 : Number(values.samples);
if (!(Number.isInteger(samples) && samples >= 1)) fail(`--samples must be a positive integer`);

// Per-page tuning resolves in the page loop — defaults, then the page's
// fill-src/<cat>/notes.json registry entry, then explicit CLI flags (CLI wins).
function nightSettings(v, where) {
  const s = {
    baseTemp: v.temperature === undefined ? 0.6 : Number(v.temperature),
    maxAttempts: v['max-attempts'] === undefined ? 3 : Number(v['max-attempts']),
    driftThreshold:
      v['drift-threshold'] === undefined ? DRIFT_THRESHOLD_DEFAULT : Number(v['drift-threshold']),
    nightLumaMax:
      v['night-luma-max'] === undefined ? NIGHT_BG_LUMA_MAX_DEFAULT : Number(v['night-luma-max']),
    lineWhiteMin:
      v['line-white-min'] === undefined ? LINE_WHITE_MIN_DEFAULT : Number(v['line-white-min']),
    dilateLines: v['dilate-lines'] === undefined ? 0 : Number(v['dilate-lines']),
    notes: v.notes,
  };
  if (!(Number.isInteger(s.maxAttempts) && s.maxAttempts >= 1))
    fail(`--max-attempts must be a positive integer (${where})`);
  if (!(s.driftThreshold >= 0)) fail(`--drift-threshold must be a non-negative number (${where})`);
  if (!(s.nightLumaMax >= 0)) fail(`--night-luma-max must be a non-negative number (${where})`);
  if (!(s.lineWhiteMin >= 0)) fail(`--line-white-min must be a non-negative number (${where})`);
  if (!(Number.isInteger(s.dilateLines) && s.dilateLines >= 0))
    fail(`--dilate-lines must be a non-negative integer (${where})`);
  return s;
}
nightSettings(values, 'cli');
if (!values['dry-run'] && !process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

// Generate one take, register it to the source, and score four ways: structural
// DRIFT (invented outlines), NIGHT-ness (background too bright / daytime), LINE
// color (outlines re-inked dark instead of staying white), and EYES (every eye
// the page's light fill paints must stay lively at night — not flooded flat;
// lib/eye-fill.mjs, skipped when the page has no committed light raw to
// reference). Retry (with a rising temperature to shake loose a different
// composition) until a take passes all gates or the attempt budget runs out. A
// take is "acceptable" when its background reads as night AND its outlines
// stayed white AND its eyes are painted; among acceptable takes we keep the
// least-drifted, and stop early once one is also drift-clean. If none qualify
// we fall back to the least-drifted take overall and flag it, so even a
// stubborn page yields a render.
async function generateCleanTake({
  darkInput,
  source,
  pen,
  chalk,
  lightRaw,
  width,
  height,
  temp0,
  lightEyes,
  cfg,
}) {
  const { maxAttempts, nightLumaMax, lineWhiteMin, driftThreshold } = cfg;
  let best = null; // lowest drift overall (fallback)
  let bestAccept = null; // lowest drift among takes that pass mood + line + eyes
  let attemptsRun = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsRun = attempt;
    const temperature = Math.min(2, temp0 + (attempt - 1) * 0.15);
    const { bytes } = await generateDarkPage(ai, {
      imageBytes: darkInput,
      mimeType: 'image/webp',
      temperature,
      chalked: !!chalk,
      notes: cfg.notes,
    });
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    // Edges are polarity-agnostic, so align the colored output to the ink-on-white
    // line-art source (chalk when forked, else pen) to undo the model's nudge.
    const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
    const drift = await scoreDrift(aligned, source);
    const night = await scoreNightness(aligned, source);
    const line = await scoreLineColor(aligned, source);
    // Eye cores always come from the PEN outline (the chalk's solid sclera has
    // no nested rings to find); with a chalk the measured pixels are the
    // simulated final composite rather than the raw fill.
    const composite = chalk ? await compositeNight(aligned, chalk) : aligned;
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
    const take = { aligned, dx, dy, drift, night, line, eyes, attempt };
    // Fallback ranking: fewest dead eyes first, then least drift — a take with
    // living eyes and a hair more drift beats a drift-perfect take whose eyes
    // are flooded flat (the failure mode a dark-bodied subject like the spider
    // rolls constantly).
    if (
      !best ||
      eyes.failed < best.eyes.failed ||
      (eyes.failed === best.eyes.failed && drift.ratio < best.drift.ratio)
    )
      best = take;
    const moodOk = night.bgLuma <= nightLumaMax;
    const lineOk = line.lineWhite >= lineWhiteMin;
    if (moodOk && lineOk && eyes.passes && (!bestAccept || drift.ratio < bestAccept.drift.ratio))
      bestAccept = take;
    if (drift.ratio <= driftThreshold && moodOk && lineOk && eyes.passes) break;
  }
  return { ...(bestAccept ?? best), attemptsRun, accepted: bestAccept !== null };
}

let pages = positionals.length
  ? (await Promise.all(positionals.map(resolveArg))).flat()
  : fail('give a category or page, e.g. "space"');
// Optionally restrict to one orientation (e.g. generate wide fills without
// retouching already-good tall ones). --tall and --wide are mutually exclusive.
if (values.tall && values.wide) fail('pass only one of --tall / --wide');
if (values.tall) pages = pages.filter((p) => p.includes('-tall'));
if (values.wide) pages = pages.filter((p) => p.includes('-wide'));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

let failures = 0;
for (const page of pages) {
  const rel = relative(COLORING_DIR, page)
    .replace(/\.outline\.webp$/, '')
    .replace(/\\/g, '/');
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
        settings: {
          temperature: cfg.baseTemp,
          'max-attempts': cfg.maxAttempts,
          'drift-threshold': cfg.driftThreshold,
          'night-luma-max': cfg.nightLumaMax,
          'line-white-min': cfg.lineWhiteMin,
          'dilate-lines': cfg.dilateLines,
          notes: cfg.notes,
        },
      })
    );
  if (values['dry-run']) continue;
  const pen = await readFile(page);
  const { width, height } = await sharp(pen).metadata();
  // The page's chalk outline (ink-on-white), when the fork has happened — the
  // line art dark mode actually renders, so it is both the model's input and
  // the registration/scoring reference. Un-forked pages fall back to the pen.
  const chalkPath = page.replace(/\.outline\.webp$/, '.chalk.webp');
  const chalk = existsSync(chalkPath) ? await readFile(chalkPath) : null;
  const source = chalk ?? pen;
  const darkInput = await toDarkInput(source, cfg.dilateLines);
  // Eye reference: which nested cores the committed light fill paints as lively
  // eyes — cores keyed off the PEN outline on both sides of the comparison.
  // Absent (page has no light raw yet) the eye gate is skipped.
  const lightRawPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const lightRaw = existsSync(lightRawPath) ? await readFile(lightRawPath) : null;
  const lightEyes = lightRaw ? await scoreEyeFill(lightRaw, pen) : null;

  for (let i = 0; i < samples; i++) {
    const label = samples > 1 ? `${rel}  ${i + 1}/${samples}` : rel;
    process.stdout.write(`${label} ... `);
    try {
      const take = await generateCleanTake({
        darkInput,
        source,
        pen,
        chalk,
        lightRaw,
        width,
        height,
        temp0: cfg.baseTemp + i * 0.12,
        lightEyes,
        cfg,
      });
      const colored = await sharp(take.aligned).webp({ quality: WEBP_QUALITY }).toBuffer();

      const dir = join(OUT_DIR, dirname(rel));
      await mkdir(dir, { recursive: true });
      const base = rel.split('/').pop();
      const out = join(dir, samples > 1 ? `${base}.sample-${i + 1}.webp` : `${base}.webp`);
      await sharp(colored).toFile(out);
      // Also stash the dark input beside it once, for the review montage.
      if (i === 0) await sharp(darkInput).toFile(join(dir, `${base}.input.webp`));
      const nudge = take.dx || take.dy ? `  shift ${take.dx},${take.dy}` : '';
      const status = take.accepted
        ? `ok${take.attemptsRun > 1 ? `  kept attempt ${take.attempt}/${take.attemptsRun}` : ''}`
        : `kept least-bad attempt ${take.attempt}/${take.attemptsRun}`;
      const stats = `  drift ${take.drift.ratio.toFixed(4)} bgLuma ${take.night.bgLuma.toFixed(0)} lineW ${take.line.lineWhite.toFixed(0)}`;
      const failed = take.accepted
        ? ''
        : (take.night.bgLuma > cfg.nightLumaMax
            ? `  night-gate FAILED (bgLuma ${take.night.bgLuma.toFixed(0)} > max ${cfg.nightLumaMax})`
            : '') +
          (take.line.lineWhite < cfg.lineWhiteMin
            ? `  line-gate FAILED (lineW ${take.line.lineWhite.toFixed(0)} < min ${cfg.lineWhiteMin})`
            : '') +
          (take.eyes.coreFailed ? `  eye-gate FAILED (${take.eyes.coreFailed} flat eyes)` : '') +
          (take.eyes.orbFailed
            ? `  orb-gate FAILED (${take.eyes.orbFailed} blank-orb eyes, median ${take.eyes.worstOrb?.median})`
            : '');
      const warn = take.drift.ratio > cfg.driftThreshold ? '  ⚠ still drifting' : '';
      console.log(`${status}${nudge}${stats}${failed}${warn}  -> ${relative(REPO_ROOT, out)}`);
    } catch (err) {
      failures++;
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
    }
  }
}
if (failures) fail(`${failures} render(s) failed.`);
console.log('Done.');
