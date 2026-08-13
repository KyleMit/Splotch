// Optimize every shipped SVG in the web app with SVGO, in place.
//
// The logo and icon set are inlined into the DOM via {@html} in Icon.svelte, so
// every vector node is a real mount-time element and every byte is shipped. A
// one-off SVGO pass drifts the moment a new icon lands un-optimized (that's how
// splotchy.svg was handled originally — ADR-0044). This audit re-establishes the
// invariant on demand and in CI instead.
//
// Idempotent by construction: SVGO's output for a given input + config is stable
// (verified across the whole icon set — a second pass is byte-for-byte identical),
// so re-running only rewrites SVGs that aren't already at their optimized form —
// i.e. newly added or hand-edited ones. Nothing to log; the working tree is the
// record.
//
// Usage:
//   node tools/optimize-svg-assets.mjs           # optimize in place (writes changes)
//   node tools/optimize-svg-assets.mjs --check   # CI: exit 1 if any SVG isn't optimized
//
// Config note: we run SVGO's default (visually-lossless) preset. In SVGO 4
// `removeViewBox` is NOT part of preset-default, so the `viewBox` every icon
// relies on for CSS scaling (Icon.svelte sizes the <svg> at 100%) is preserved.

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { optimize } from 'svgo';
import { ROOT } from './lib/proc.mjs';

// `cleanupIds` minifies every surviving id to a one-letter name, so two icons
// inlined into the same document collide (`more-colors.svg` already ships
// `id="a"`, and `url(#a)`/`href="#a"` then resolve to whichever came first).
// Icons that need a stable id opt out by prefixing it `icon-`; every other id
// still gets minified, so no existing icon is rewritten by the override.
// Uniqueness across the surviving ids is enforced by web/src/lib/icons/iconIds.test.ts.
const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: { overrides: { cleanupIds: { preservePrefixes: ['icon-'] } } },
    },
  ],
};

const {
  values: { check },
} = parseArgs({ options: { check: { type: 'boolean' } } });

const files = globSync('web/**/*.svg', { cwd: ROOT })
  .map((p) => `${ROOT}/${p}`)
  .filter((p) => {
    const rel = relative(ROOT, p);
    return (
      !rel.includes('/node_modules/') &&
      !rel.includes('/.svelte-kit/') &&
      !rel.includes('/build/') &&
      !rel.includes('/.netlify/')
    );
  })
  .sort();

if (files.length === 0) {
  console.log('[optimize-svg-assets] No SVGs found under web/.');
  process.exit(0);
}

let changedCount = 0;
let savedTotal = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const before = readFileSync(file, 'utf8');
  const after = optimize(before, { ...SVGO_CONFIG, path: file }).data;

  if (after === before) continue;

  changedCount++;
  const beforeBytes = Buffer.byteLength(before);
  const afterBytes = Buffer.byteLength(after);
  const delta = beforeBytes - afterBytes;
  savedTotal += delta;
  // SVGO's canonical form is occasionally larger than the hand-authored input,
  // so the sign is carried explicitly rather than hardcoded to a minus.
  const pct = Math.abs((delta / beforeBytes) * 100).toFixed(0);
  const verb = check ? 'NEEDS OPT' : 'optimized';
  const size = `${beforeBytes} -> ${afterBytes} bytes (${delta < 0 ? '+' : '-'}${pct}%)`;
  console.log(`[optimize-svg-assets] ${verb}  ${rel}  ${size}`);

  if (!check) writeFileSync(file, after);
}

const kib = (n) => (n / 1024).toFixed(1);

if (changedCount === 0) {
  console.log(`[optimize-svg-assets] ${files.length} SVG(s) already optimal — nothing to do.`);
  process.exit(0);
}

// The aggregate is a net of per-file deltas that individually go either way, so
// like the per-file line it has to follow its own sign — a run whose growth
// outweighs its savings otherwise reports a negative saving.
const net =
  savedTotal < 0 ? `${kib(-savedTotal)} KiB net growth` : `${kib(savedTotal)} KiB net saving`;

if (check) {
  console.error(
    `\n[optimize-svg-assets] ${changedCount} of ${files.length} SVG(s) are not optimized ` +
      `(${net}). Run \`npm run optimize:svg-assets\` and commit the result.`
  );
  process.exit(1);
}

console.log(`\n[optimize-svg-assets] optimized ${changedCount} of ${files.length} SVG(s), ${net}.`);
