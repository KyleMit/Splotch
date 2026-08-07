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
//   node scripts/image-audit.mjs           # optimize in place (writes changes)
//   node scripts/image-audit.mjs --check   # CI: exit 1 if any SVG isn't optimized
//
// A file SVGO cannot parse is reported and counted as a failure rather than
// thrown: an uncaught parse error would abandon every SVG sorted after it, which
// turns the drift guard off for the rest of the tree while still exiting
// non-zero — indistinguishable from a clean fail.
//
// Config note: we run SVGO's default (visually-lossless) preset. In SVGO 4
// `removeViewBox` is NOT part of preset-default, so the `viewBox` every icon
// relies on for CSS scaling (Icon.svelte sizes the <svg> at 100%) is preserved.

import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { optimize } from 'svgo';
import { isMain, ROOT } from './lib/proc.mjs';

// Generator-input SVGs live under static/ but are never shipped or inlined —
// they're consumed by scripts/gen-*.mjs. Optimizing them is at best pointless
// (no DOM/ship benefit) and at worst breaking: gen-large-image.mjs hand-parses
// large-image.svg's `M x y L x y` paths and per-<path> stroke attributes, both
// of which SVGO's convertPathData / attribute plugins rewrite. Skip them.
//
// Every entry is checked for existence up front: an exemption for a path that
// moved is a silent hole — the file gets optimized under its new name and the
// generator breaks with nothing pointing at the stale entry.
const IGNORE = new Set(['web/static/large-image.svg', 'web/static/styles/source.svg']);

const SVGO_CONFIG = { multipass: true, plugins: ['preset-default'] };

const kib = (n) => (n / 1024).toFixed(1);

function shippedSvgs(root) {
  return globSync('web/**/*.svg', { cwd: root })
    .filter(
      (rel) =>
        !rel.includes('/node_modules/') &&
        !rel.includes('/.svelte-kit/') &&
        !rel.includes('/build/') &&
        !rel.includes('/.netlify/') &&
        !IGNORE.has(rel)
    )
    .sort();
}

function staleIgnoreEntries(root) {
  return [...IGNORE].filter((rel) => !existsSync(join(root, rel)));
}

/**
 * @param {object} [options]
 * @param {boolean} [options.check] Report only; never write.
 * @param {string} [options.root] Repo root to scan. A test seam — the suite
 *   points it at a fixture tree so the real icons stay untouched.
 */
export function auditImages({ check = false, root = ROOT } = {}) {
  const stale = staleIgnoreEntries(root);
  if (stale.length > 0) {
    for (const rel of stale) {
      console.error(`[image-audit] ignore entry no longer exists: ${rel}`);
    }
    console.error(
      `\n[image-audit] ${stale.length} stale ignore entr${stale.length === 1 ? 'y' : 'ies'} — ` +
        `update the IGNORE set in scripts/image-audit.mjs.`
    );
    return { exitCode: 1, changed: [], failed: [] };
  }

  const files = shippedSvgs(root);
  if (files.length === 0) {
    console.log('[image-audit] No SVGs found under web/.');
    return { exitCode: 0, changed: [], failed: [] };
  }

  const changed = [];
  const failed = [];
  let savedTotal = 0;

  for (const rel of files) {
    const file = join(root, rel);
    const before = readFileSync(file, 'utf8');

    let after;
    try {
      after = optimize(before, { ...SVGO_CONFIG, path: file }).data;
    } catch (error) {
      failed.push(rel);
      console.error(`[image-audit] FAILED     ${rel}  ${error.message.split('\n')[0]}`);
      continue;
    }

    if (after.trim() === '') {
      failed.push(rel);
      console.error(`[image-audit] FAILED     ${rel}  optimizes to nothing (empty SVG?)`);
      continue;
    }

    if (after === before) continue;

    changed.push(rel);
    const beforeBytes = Buffer.byteLength(before);
    const afterBytes = Buffer.byteLength(after);
    savedTotal += beforeBytes - afterBytes;
    const pct = (((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(0);
    const verb = check ? 'NEEDS OPT ' : 'optimized ';
    console.log(`[image-audit] ${verb} ${rel}  ${beforeBytes} -> ${afterBytes} bytes (-${pct}%)`);

    if (!check) writeFileSync(file, after);
  }

  if (changed.length > 0) {
    if (check) {
      console.error(
        `\n[image-audit] ${changed.length} of ${files.length} SVG(s) are not optimized ` +
          `(${kib(savedTotal)} KiB to save). Run \`npm run img:audit\` and commit the result.`
      );
    } else {
      console.log(
        `\n[image-audit] optimized ${changed.length} of ${files.length} SVG(s), ` +
          `saved ${kib(savedTotal)} KiB.`
      );
    }
  } else if (failed.length === 0) {
    console.log(`[image-audit] ${files.length} SVG(s) already optimal — nothing to do.`);
  }

  if (failed.length > 0) {
    console.error(
      `\n[image-audit] ${failed.length} of ${files.length} SVG(s) could not be optimized: ` +
        `${failed.join(', ')}.`
    );
  }

  const failing = failed.length > 0 || (check && changed.length > 0);
  return { exitCode: failing ? 1 : 0, changed, failed };
}

if (isMain(import.meta.url)) {
  const {
    values: { check },
  } = parseArgs({ options: { check: { type: 'boolean' } } });
  process.exit(auditImages({ check }).exitCode);
}
