// Audit every committed RAW colored twin (`twin-src/**/*.light.raw.webp`) for
// outline drift against its source line art, using the SAME scoring the generation
// gate applies (lib/outline-match.mjs). It scores the raws — not the shipped
// `*.light.webp` — because shipping punches the twin's own outlines out
// (punch-twin-outlines.mjs), leaving nothing for outlineMatch to register; the raw
// keeps the lines, and the shipped twin is a pure derivation of it, so a clean raw
// means a clean reveal. It exists because the gate only ran at generation time and
// only on a global average: twins generated before the worst-tile gate — most
// notably nature/ant-wide — shipped with a badly drifted region (a flower) that the
// child sees under the magic brush, while the global score stayed above the bar.
//
// This flags those already-committed twins so they can be regenerated
// (`npm run gen:coloring-fills -- <page>`), and re-run afterwards to confirm the
// fix. It reads committed assets only — no network, no GEMINI_API_KEY — so it's
// safe to run anytime.
//
//   npm run gen:coloring-fills:audit                 audit every twin
//   npm run gen:coloring-fills:audit -- nature farm  only these categories
//   npm run gen:coloring-fills:audit -- nature/ant-wide
//   npm run gen:coloring-fills:audit -- --overlay    also write drift overlays
//
// Exits non-zero if any twin fails, so it doubles as a check.
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT, COLORING_DIR, TWIN_SRC_DIR, SAMPLES_DIR, fail } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { overlay: { type: 'boolean' } },
});

// Resolve args to a list of source line-art pages (default: the whole tree). An arg
// is a single page ("nature/ant-wide") or a category dir ("nature").
async function pagesUnder(sub = '') {
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  const out = [];
  for await (const entry of glob('**/*-{tall,wide}.outline.webp', { cwd }))
    out.push(join(cwd, entry));
  return out;
}
async function resolveArg(arg) {
  if (arg.endsWith('.webp')) return [join(COLORING_DIR, arg)];
  const asFile = join(COLORING_DIR, `${arg}.outline.webp`);
  if (existsSync(asFile)) return [asFile];
  const asDir = join(COLORING_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return pagesUnder(arg);
  return [asFile];
}

const pages = (
  positionals.length ? (await Promise.all(positionals.map(resolveArg))).flat() : await pagesUnder()
).sort();

const overlayDir = join(SAMPLES_DIR, 'drift');
if (values.overlay) await mkdir(overlayDir, { recursive: true });

const rows = [];
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '');
  const twin = join(TWIN_SRC_DIR, `${rel}.light.raw.webp`);
  if (!existsSync(twin)) continue; // no twin generated for this page yet
  const [source, filled] = await Promise.all([readFile(page), readFile(twin)]);
  const { keep, localKeep, worstTile, overlay } = await outlineMatch(source, filled);
  const failed = keep < KEEP_THRESHOLD || localKeep < LOCAL_KEEP_THRESHOLD;
  rows.push({ rel, keep, localKeep, worstTile, failed });
  if (values.overlay && failed) {
    const out = join(overlayDir, `${rel.replace(/\//g, '-')}.overlay.png`);
    await writeFile(out, overlay);
  }
}

if (!rows.length) fail('No colored twins found for the given pages.');

// Worst first, so drift is at the top.
rows.sort((a, b) => a.localKeep - b.localKeep);
const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);
console.log(`${'page'.padEnd(28)} ${'keep'.padStart(6)} ${'worstTile'.padStart(9)}  where`);
for (const r of rows) {
  const where = r.worstTile ? `tile ${r.worstTile.x},${r.worstTile.y}` : '';
  const flag = r.failed ? '  ⚠ DRIFT — regenerate' : '';
  console.log(`${r.rel.padEnd(28)} ${pct(r.keep)} ${pct(r.localKeep)}  ${where}${flag}`);
}

const bad = rows.filter((r) => r.failed);
console.log(
  `\n${rows.length} twin(s) audited · ${bad.length} flagged` +
    ` (keep < ${pct(KEEP_THRESHOLD).trim()} or worst tile < ${pct(LOCAL_KEEP_THRESHOLD).trim()}).`
);
if (values.overlay && bad.length) {
  console.log(
    `Drift overlays: ${relative(REPO_ROOT, overlayDir)}/  (red = drifted source outline)`
  );
}
if (bad.length) {
  console.log(`Regenerate: npm run gen:coloring-fills -- ${bad.map((r) => r.rel).join(' ')}`);
  process.exitCode = 1;
}
