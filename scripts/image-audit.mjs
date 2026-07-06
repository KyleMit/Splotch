// Optimize every shipped SVG in the web app with SVGO, in place.
//
// The logo and icon set are inlined into the DOM via {@html} in Icon.svelte, so
// every vector node is a real mount-time element and every byte is shipped. A
// one-off SVGO pass drifts the moment a new icon lands un-optimized (that's how
// splotchy.svg was handled originally — ADR-0043). This audit re-establishes the
// invariant on demand and in CI instead.
//
// Idempotent by construction: SVGO's output for a given input + config is stable
// (verified across the whole icon set — a second pass is byte-for-byte identical),
// so re-running only rewrites SVGs that aren't already at their optimized form —
// i.e. newly added or hand-edited ones. Nothing to log; the working tree is the
// record.
//
// Usage:
//   node scripts/image-audit.mjs           # optimize in place (writes changes)
//   node scripts/image-audit.mjs --check   # CI: exit 1 if any SVG isn't optimized
//
// Config note: we run SVGO's default (visually-lossless) preset. In SVGO 4
// `removeViewBox` is NOT part of preset-default, so the `viewBox` every icon
// relies on for CSS scaling (Icon.svelte sizes the <svg> at 100%) is preserved.

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { optimize } from 'svgo';
import { ROOT } from './lib/utils.mjs';

// Generator-input SVGs live under static/ but are never shipped or inlined —
// they're consumed by scripts/gen-*.mjs. Optimizing them is at best pointless
// (no DOM/ship benefit) and at worst breaking: gen-large-image.mjs hand-parses
// large-image.svg's `M x y L x y` paths and per-<path> stroke attributes, both
// of which SVGO's convertPathData / attribute plugins rewrite. Skip them.
const IGNORE = new Set(['web/static/large-image.svg', 'web/static/styles/source.svg']);

const SVGO_CONFIG = { multipass: true, plugins: ['preset-default'] };

const check = process.argv.includes('--check');

const posix = (p) => relative(ROOT, p).split('\\').join('/');

const files = globSync('web/**/*.svg', { cwd: ROOT })
  .map((p) => `${ROOT}/${p}`)
  .filter((p) => {
    const rel = posix(p);
    return (
      !rel.includes('/node_modules/') &&
      !rel.includes('/.svelte-kit/') &&
      !rel.includes('/build/') &&
      !rel.includes('/.netlify/') &&
      !IGNORE.has(rel)
    );
  })
  .sort();

if (files.length === 0) {
  console.log('[image-audit] No SVGs found under web/.');
  process.exit(0);
}

let changedCount = 0;
let savedTotal = 0;

for (const file of files) {
  const rel = posix(file);
  const before = readFileSync(file, 'utf8');
  const after = optimize(before, { ...SVGO_CONFIG, path: file }).data;

  if (after === before) continue;

  changedCount++;
  const beforeBytes = Buffer.byteLength(before);
  const afterBytes = Buffer.byteLength(after);
  savedTotal += beforeBytes - afterBytes;
  const pct = (((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(0);
  const verb = check ? 'NEEDS OPT' : 'optimized';
  console.log(`[image-audit] ${verb}  ${rel}  ${beforeBytes} -> ${afterBytes} bytes (-${pct}%)`);

  if (!check) writeFileSync(file, after);
}

const kib = (n) => (n / 1024).toFixed(1);

if (changedCount === 0) {
  console.log(`[image-audit] ${files.length} SVG(s) already optimal — nothing to do.`);
  process.exit(0);
}

if (check) {
  console.error(
    `\n[image-audit] ${changedCount} of ${files.length} SVG(s) are not optimized ` +
      `(${kib(savedTotal)} KiB to save). Run \`npm run img:audit\` and commit the result.`
  );
  process.exit(1);
}

console.log(
  `\n[image-audit] optimized ${changedCount} of ${files.length} SVG(s), ` +
    `saved ${kib(savedTotal)} KiB.`
);
