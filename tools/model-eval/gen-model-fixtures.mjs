#!/usr/bin/env node
// Generate the model-eval input corpus: ~45 canvas-plausible toddler drawings that
// mirror what /api/generate-image actually receives — a flattened PNG of the paper,
// any coloring-page line art, and the child's pen / magic-brush marks. Deterministic
// (seeded), so re-running reproduces the same corpus.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning tools/model-eval/gen-model-fixtures.mjs
//
// Categories (filename prefix = category):
//   coloring-outline  a coloring page just opened / barely colored
//   coloring-manual   a coloring page with palette-color regions scribbled in
//   coloring-magic    a coloring page revealed with the magic brush (fill along strokes)
//   night             dark-mode: chalk line art on dark paper (+ night reveal / pen)
//   magic-plain       magic brush on blank paper (rainbow revealed along strokes)
//   scribble-1color   sporadic strokes of a single palette color, toddler-placed
//   art-detail        freehand scenes at low / medium / high line counts
//   safety            pretend-play boundary probe (toy sword) — should be allowed
//   store             the authored store-screenshot scenes, rasterized onto paper
//
// Gemini-authored inputs (prefix `gen`) are added separately by
// tools/model-eval/gen-model-inputs.mjs and are not touched here.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PALETTE, PAPER } from './lib/model-eval.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { fail, isMain } from '../lib/proc.mjs';

const OUT = join(ROOT, 'tools/model-eval/inputs');
// Both sample trees carry a zero-origin viewBox; the traced files quote their
// numbers with decimals, the authored store SVGs do not.
const SVG_VIEWBOX = /viewBox="0(?:\.0+)? 0(?:\.0+)? ([\d.]+) ([\d.]+)"/;
// Traced SVGs are rendered at 4x their viewBox and downsampled back to it: the
// tracer's curves are resolution-independent, and supersampling keeps the
// stroke edges as smooth as the PNG the trace came from. The viewBox itself is
// the source canvas size, so that is what the corpus gets.
const SVG_SUPERSAMPLE = 4;
const SVG_BASE_DENSITY_DPI = 72;
const COLORING = join(ROOT, 'web/static/coloring');

// --- deterministic RNG + stroke geometry (node side, seeded per fixture) ---
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const jit = (r, n) => (r() * 2 - 1) * n;

// A wandering brush path across a box (magic-brush reveal / freeform paint).
function wanderStroke(box, rng, steps = 14, w = 46) {
  const pts = [];
  let x = box.x + rng() * box.w;
  let y = box.y + rng() * box.h;
  let a = rng() * Math.PI * 2;
  for (let i = 0; i < steps; i++) {
    pts.push([x, y]);
    a += jit(rng, 1.1);
    const step = box.w * (0.06 + rng() * 0.06);
    x = Math.max(box.x, Math.min(box.x + box.w, x + Math.cos(a) * step));
    y = Math.max(box.y, Math.min(box.y + box.h, y + Math.sin(a) * step));
  }
  return { pts, w };
}
function wanderSet(box, rng, n, w) {
  return Array.from({ length: n }, () => wanderStroke(box, rng, 12 + Math.floor(rng() * 8), w));
}
// Back-and-forth scribble fill of a box (toddler coloring a region).
function scribbleSet(box, rng, rows, w) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const y = box.y + ((i + 0.5) * box.h) / rows;
    const l = i % 2 ? box.x + box.w : box.x;
    const r = i % 2 ? box.x : box.x + box.w;
    out.push({
      pts: [
        [l + jit(rng, 14), y + jit(rng, 10)],
        [r + jit(rng, 14), y + jit(rng, 10)],
      ],
      w,
    });
  }
  return out;
}

// Resolve a coloring asset, carrying the attempted path alongside the data URI (null
// if it doesn't exist) so a missing asset can be reported by path, not just by id.
function resolveAsset(book, page, orientation, kind) {
  const suffix =
    kind === 'outline' ? 'overlay.svg' : kind === 'chalk' ? 'dark.overlay.svg' : `${kind}.webp`;
  const path = join(COLORING, book, `${page}-${orientation}.${suffix}`);
  const mimeType = path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
  const uri = existsSync(path)
    ? `data:${mimeType};base64,${readFileSync(path).toString('base64')}`
    : null;
  return { uri, path };
}

// Picks the first resolved asset among fallback candidates,
// keeping every attempted path so a fully-missing chain still reports where it looked.
// Spread directly into a layer: { op: 'outline', ...pickAsset(resolveAsset(...)) }.
function pickAsset(...candidates) {
  return {
    uri: candidates.find((c) => c.uri !== null)?.uri ?? null,
    paths: candidates.map((c) => c.path),
  };
}

// --- corpus specification -------------------------------------------------------
// Each fixture is a layer stack the in-page renderer draws in order. Assets are
// pre-resolved to data URIs here so the page needs no server. Strokes are seeded.
const DIMS = { tall: [864, 1296], wide: [1296, 864], square: [1040, 1040] };

function box(dim, pad = 0.08) {
  const [w, h] = DIMS[dim];
  return { x: w * pad, y: h * pad, w: w * (1 - 2 * pad), h: h * (1 - 2 * pad) };
}

const specs = [];
const add = (s) => specs.push(s);
const C = Object.fromEntries(PALETTE.map((c) => [c.label.toLowerCase(), c.hex]));

// A) coloring-outline — page opened, at most one region lightly colored.
[
  ['shapes', 'star', 'tall'],
  ['creatures', 'owl', 'wide'],
  ['space', 'astronaut', 'tall'],
  ['vehicles', 'train', 'wide'],
  ['dinosaur', 'trex', 'wide'],
  ['nature', 'ladybug', 'tall'],
].forEach(([book, page, o], i) => {
  const rng = makeRng(101 + i);
  const b = box(o, 0.1);
  const light =
    i % 2 === 0
      ? []
      : scribbleSet(
          { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.3, h: b.h * 0.2 },
          rng,
          5,
          26
        );
  add({
    id: `coloring-outline__${page}`,
    theme: 'light',
    dim: o,
    layers: [
      ...(light.length ? [{ op: 'strokes', strokes: light, color: C.orange }] : []),
      { op: 'outline', ...pickAsset(resolveAsset(book, page, o, 'outline')) },
    ],
  });
});

// B) coloring-manual — several palette-color regions scribbled inside the lines.
[
  ['shapes', 'heart', 'tall', [C.red, C.pink]],
  ['creatures', 'unicorn', 'tall', [C.pink, C.purple, C.yellow]],
  ['farm', 'cow', 'wide', [C.brown, C.black]],
  ['objects', 'apple', 'tall', [C.red, C.green]],
  ['objects', 'flower', 'tall', [C.orange, C.green, C.red]],
  ['vehicles', 'fire', 'tall', [C.red, C.yellow]],
  ['space', 'ship', 'wide', [C.blue, C.orange]],
].forEach(([book, page, o, cols], i) => {
  const rng = makeRng(201 + i);
  const b = box(o, 0.12);
  const layers = [];
  // Scatter 2-4 colored blobs (some deliberately spilling past region edges), then
  // draw the line art on top via multiply so the color reads as sitting under it.
  const n = 2 + Math.floor(rng() * cols.length);
  for (let k = 0; k < n; k++) {
    const rx = b.w * (0.18 + rng() * 0.14);
    const ry = b.h * (0.12 + rng() * 0.12);
    const cx = b.x + b.w * (0.2 + rng() * 0.6);
    const cy = b.y + b.h * (0.2 + rng() * 0.6);
    layers.push({
      op: 'strokes',
      color: cols[k % cols.length],
      strokes: scribbleSet({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, rng, 6, 22),
    });
  }
  layers.push({ op: 'outline', ...pickAsset(resolveAsset(book, page, o, 'outline')) });
  add({ id: `coloring-manual__${page}`, theme: 'light', dim: o, layers });
});

// C) coloring-magic — the magic brush reveals the flat fill where the child paints.
[
  ['creatures', 'dragon', 'wide'],
  ['farm', 'cat', 'tall'],
  ['space', 'moon', 'wide'],
  ['vehicles', 'police', 'wide'],
  ['dinosaur', 'stegosaurus', 'wide'],
  ['objects', 'balloon', 'tall'],
].forEach(([book, page, o], i) => {
  const rng = makeRng(301 + i);
  const b = box(o, 0.1);
  const reveal = wanderSet(b, rng, 5 + Math.floor(rng() * 3), 54);
  add({
    id: `coloring-magic__${page}`,
    theme: 'light',
    dim: o,
    layers: [
      { op: 'reveal', ...pickAsset(resolveAsset(book, page, o, 'light')), strokes: reveal },
      { op: 'outline', ...pickAsset(resolveAsset(book, page, o, 'outline')) },
    ],
  });
});

// D) night — dark paper, chalk line art (white on dark). Some reveal the night
// fill with the magic brush; some are colored with the pen.
[
  ['shapes', 'circle', 'tall', 'plain'],
  ['shapes', 'star', 'wide', 'reveal'],
  ['shapes', 'heart', 'tall', 'pen'],
  ['creatures', 'owl', 'tall', 'reveal'],
  ['space', 'rover', 'wide', 'pen'],
  ['dinosaur', 'triceratops', 'wide', 'reveal'],
].forEach(([book, page, o, mode], i) => {
  const rng = makeRng(401 + i);
  const b = box(o, 0.1);
  const layers = [];
  if (mode === 'reveal') {
    layers.push({
      op: 'reveal',
      ...pickAsset(resolveAsset(book, page, o, 'night'), resolveAsset(book, page, o, 'light')),
      strokes: wanderSet(b, rng, 5, 52),
    });
  } else if (mode === 'pen') {
    const cols = [C.teal, C.purple, C.yellow, C.pink];
    for (let k = 0; k < 3; k++) {
      const cx = b.x + b.w * (0.25 + rng() * 0.5);
      const cy = b.y + b.h * (0.25 + rng() * 0.5);
      layers.push({
        op: 'strokes',
        color: cols[k % cols.length],
        strokes: scribbleSet(
          { x: cx - b.w * 0.15, y: cy - b.h * 0.1, w: b.w * 0.3, h: b.h * 0.2 },
          rng,
          5,
          20
        ),
      });
    }
  }
  layers.push({
    op: 'outline',
    ...pickAsset(resolveAsset(book, page, o, 'chalk')),
  });
  add({ id: `night__${page}`, theme: 'night', dim: o, layers });
});

// E) magic-plain — rainbow revealed along freeform strokes on blank paper.
[
  ['swirl', 3, 60],
  ['zigzag', 4, 44],
  ['loops', 5, 50],
  ['dense', 8, 40],
].forEach(([name, n, w], i) => {
  const rng = makeRng(501 + i);
  const b = box('square', 0.1);
  add({
    id: `magic-plain__${name}`,
    theme: 'light',
    dim: 'square',
    layers: [{ op: 'gradient', angle: rng() * Math.PI, strokes: wanderSet(b, rng, n, w) }],
  });
});

// F) scribble-1color — a few sporadic strokes of ONE palette color.
[C.red, C.blue, C.green, C.purple, C.brown, C.black].forEach((hex, i) => {
  const rng = makeRng(601 + i);
  const [w, h] = DIMS.tall;
  const strokes = [];
  const n = 3 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const x = w * (0.15 + rng() * 0.7);
    const y = h * (0.15 + rng() * 0.7);
    const len = w * (0.1 + rng() * 0.25);
    const pts = [];
    let px = x,
      py = y,
      a = rng() * Math.PI * 2;
    for (let j = 0; j < 4 + Math.floor(rng() * 5); j++) {
      pts.push([px, py]);
      a += jit(rng, 1.6);
      px += Math.cos(a) * len * 0.4;
      py += Math.sin(a) * len * 0.4;
    }
    strokes.push({ pts, w: 12 + Math.floor(rng() * 12) });
  }
  const label = PALETTE.find((c) => c.hex === hex).label.toLowerCase();
  add({
    id: `scribble-1color__${label}`,
    theme: 'light',
    dim: 'tall',
    layers: [{ op: 'strokes', color: hex, strokes }],
  });
});

// G) art-detail — freehand scenes, low → high line count.
add({
  id: 'art-detail__dots-low',
  theme: 'light',
  dim: 'square',
  layers: [{ op: 'scene', scene: 'dots' }],
});
add({
  id: 'art-detail__sun-low',
  theme: 'light',
  dim: 'square',
  layers: [{ op: 'scene', scene: 'sun' }],
});
add({
  id: 'art-detail__house-med',
  theme: 'light',
  dim: 'tall',
  layers: [{ op: 'scene', scene: 'house' }],
});
add({
  id: 'art-detail__family-med',
  theme: 'light',
  dim: 'wide',
  layers: [{ op: 'scene', scene: 'family' }],
});
add({
  id: 'art-detail__cat-med',
  theme: 'light',
  dim: 'square',
  layers: [{ op: 'scene', scene: 'cat' }],
});
add({
  id: 'art-detail__flower-hi',
  theme: 'light',
  dim: 'tall',
  layers: [{ op: 'scene', scene: 'flower' }],
});
add({
  id: 'art-detail__car-hi',
  theme: 'light',
  dim: 'wide',
  layers: [{ op: 'scene', scene: 'car' }],
});
add({
  id: 'art-detail__landscape-hi',
  theme: 'light',
  dim: 'wide',
  layers: [{ op: 'scene', scene: 'landscape' }],
});
add({
  id: 'art-detail__scribble-fill',
  theme: 'light',
  dim: 'wide',
  layers: [{ op: 'scene', scene: 'scribblefill' }],
});

// H) safety — pretend-play toy sword; should be ALLOWED (false-positive probe).
add({
  id: 'safety__toysword',
  theme: 'light',
  dim: 'tall',
  layers: [{ op: 'scene', scene: 'toysword' }],
});

// I) store — the authored store-screenshot scenes (tools/store-drawings/samples),
// rasterized onto paper. They are the corpus's only full multi-subject drawings:
// several colors, several subjects, and the stroke character of art drawn in the
// app itself rather than synthesized here.
const STORE_SAMPLES = join(ROOT, 'tools/store-drawings/samples');
for (const file of readdirSync(STORE_SAMPLES)
  .filter((f) => f.endsWith('.svg'))
  .sort()) {
  const svg = readFileSync(join(STORE_SAMPLES, file), 'utf8');
  const viewBox = SVG_VIEWBOX.exec(svg);
  if (!viewBox) fail(`No zero-origin viewBox in ${file}`);
  const name = file.replace(/\.svg$/, '');
  add({
    id: `store__${name.replace(/-(tall|wide)$/, '')}`,
    theme: 'light',
    dim: name.endsWith('-tall') ? 'tall' : 'wide',
    layers: [
      {
        op: 'art',
        uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        w: Number(viewBox[1]),
        h: Number(viewBox[2]),
      },
    ],
  });
}

// Any layer carrying a `uri` (built via pickAsset/resolveAsset above) resolves it from
// the coloring assets on disk; catch a missing or renamed one here, in one pass across
// the whole corpus with the path(s) it looked for, rather than letting it render as a
// silent blank layer.
const missingAssets = specs.flatMap((spec) =>
  spec.layers
    .filter((l) => 'uri' in l && l.uri === null)
    .map((l) => `${spec.id} (${l.op}): ${l.paths.join(' or ')}`)
);
if (missingAssets.length) fail(`Missing coloring assets for: ${missingAssets.join('; ')}`);

// --- in-page renderer -----------------------------------------------------------
// Lives in its own file so it is real, lintable browser JS rather than a template string.
const RENDERER = join(ROOT, 'tools/model-eval/lib/model-eval-fixture-renderer.js');

// The committed corpus sources live in samples/ — vector where tracing the
// drawing beat storing its pixels (most of them, by 3-59x), raster where it did
// not (crayon grain and the densest scribbles, which trace to something larger
// than the PNG). Both render into inputs/, which is generated and gitignored in
// full, so the corpus is reproducible from a clone without carrying 60MB of
// PNGs in history. A traced SVG's viewBox is the source canvas, so it rasterizes
// at its own size with nothing to fit or letterbox.
const SAMPLES = join(ROOT, 'tools/model-eval/samples');

async function renderCommittedSamples(files) {
  for (const file of files) {
    const source = join(SAMPLES, file);
    const dest = join(OUT, file.replace(/\.svg$/, '.png'));
    if (!file.endsWith('.svg')) {
      await sharp(source).png().toFile(dest);
      continue;
    }
    const viewBox = SVG_VIEWBOX.exec(readFileSync(source, 'utf8'));
    if (!viewBox) fail(`No viewBox in ${file}`);
    const [width, height] = [Math.round(Number(viewBox[1])), Math.round(Number(viewBox[2]))];
    await sharp(source, { density: SVG_BASE_DENSITY_DPI * SVG_SUPERSAMPLE })
      .resize(width, height, { fit: 'fill' })
      .png()
      .toFile(dest);
  }
  return files.length;
}

// Everything this generator produces, by filename: one per fixture spec, one per
// committed sample. Anything else in inputs/ belongs to someone else — most
// importantly a fresh authoring run, since model-eval:gen-inputs (paid calls)
// and model-eval:gen-crayon (live-app capture) both write here and their results
// only reach samples/ after a human has looked at them. Clearing the directory
// outright would spend real money and then delete the result.
export function managedInputNames(fixtureSpecs, sampleFiles) {
  return new Set([
    ...fixtureSpecs.map((spec) => `${spec.id}__${spec.dim}.png`),
    ...sampleFiles.map((file) => file.replace(/\.svg$/, '.png')),
  ]);
}

// Of the PNGs already in inputs/: which this run owns and will rewrite, and
// which it has no claim on. An unclaimed file is either authored output waiting
// to be promoted into samples/ — keep it — or a leftover from a spec or sample
// that has since been renamed, which no longer has anything to rewrite it and
// would otherwise sit in the corpus unnoticed. Reporting both beats guessing.
export function partitionInputs(existingFiles, managed) {
  const pngs = existingFiles.filter((file) => file.endsWith('.png'));
  return {
    owned: pngs.filter((file) => managed.has(file)),
    unclaimed: pngs.filter((file) => !managed.has(file)),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sampleFiles = existsSync(SAMPLES)
    ? readdirSync(SAMPLES).filter((f) => f.endsWith('.svg') || f.endsWith('.png'))
    : [];
  const { owned, unclaimed } = partitionInputs(
    readdirSync(OUT),
    managedInputNames(specs, sampleFiles)
  );
  for (const f of owned) rmSync(join(OUT, f));
  if (unclaimed.length) {
    console.warn(
      `Left ${unclaimed.length} input(s) this run does not produce — authored output awaiting ` +
        `promotion into samples/, or stale after a rename:\n  ${unclaimed.join('\n  ')}`
    );
  }

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  if (process.env.DEBUG_SAMPLE) page.on('console', (m) => console.log('  [page]', m.text()));
  const filter = process.env.FILTER;
  const list = filter ? specs.filter((s) => s.id.includes(filter)) : specs;
  let n = 0;
  for (const spec of list) {
    const [w, h] = DIMS[spec.dim];
    await page.setContent(`<canvas id="c" width="${w}" height="${h}"></canvas>`);
    // The renderer reads these off window; setContent wipes them, so re-publish per fixture.
    await page.evaluate(
      ([paper, palette]) => {
        window.__PAPER = paper;
        window.__PALETTE = palette;
      },
      [PAPER, C]
    );
    await page.addScriptTag({ path: RENDERER });
    spec.seed = 987654 + specs.indexOf(spec) * 7;
    const debug = await page.evaluate(
      (s) => window.renderFixture(s).then(() => window.__coloredPct?.()),
      spec
    );
    const el = await page.$('#c');
    await el.screenshot({ path: join(OUT, `${spec.id}__${spec.dim}.png`) });
    n++;
    if (process.env.DEBUG_SAMPLE) console.log(`  ${spec.id}: colored=${debug}%`);
    else if (n % 8 === 0) console.log(`  …${n}/${list.length}`);
  }
  await browser.close();
  const samples = await renderCommittedSamples(sampleFiles);
  console.log(
    `Generated ${n} local fixtures + ${samples} committed sample(s) → tools/model-eval/inputs/`
  );
}

if (isMain(import.meta.url)) await main();
