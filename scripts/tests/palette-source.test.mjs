import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Single-source guard for the brand palette (web/src/lib/palette.ts): a copy
// of a palette hex anywhere else silently drifts when the palette changes.
// Scripts can't import TS, so the extraction is a regex over the file text.
const repoRoot = join(import.meta.dirname, '..', '..');
const paletteSource = readFileSync(join(repoRoot, 'web/src/lib/palette.ts'), 'utf8');
const paletteHexes = [
  ...new Set([...paletteSource.matchAll(/'#([0-9a-fA-F]{3,8})'/g)].map((m) => m[1].toLowerCase())),
];
// The optional trailing pair catches 8-digit alpha variants of a palette hex
// (#ab71e1cc) — a plausible drift copy the plain \b boundary would skip.
const hexRegex = new RegExp(`#(?:${paletteHexes.join('|')})(?:[0-9a-fA-F]{2})?\\b`, 'gi');

// file (relative to repo root) → allowed occurrence count, with the reason.
// Everything here duplicates a palette hex because it genuinely can't import
// palette.ts; anything new must migrate to an import or earn an entry.
const ALLOWED = new Map(
  Object.entries({
    // The --brand custom-property definition; CSS can't import TS.
    'web/src/tokens.css': 1,
    // BRAND_HEX seeds the design-token derivations beside the palette.
    'web/src/lib/design/tokens.ts': 1,
    // Static SVG icon depicting the palette swatches themselves; SVG fills
    // can't reference tokens.
    'web/src/lib/icons/more-colors.svg': 7,
    // Plain-node app driver clicking the green swatch by its hex selector.
    'scripts/driver-smoke.mjs': 1,
    // Perf harness swatch-click sequence; plain node can't import TS.
    'scripts/perf/session.mjs': 6,
    // Comment naming a swatch selector in an event-recording example.
    'scripts/perf/ipad-recorder.js': 1,
    // Scrapbook report chrome renders palette swatches; plain node can't
    // import TS.
    'scripts/lib/scrapbook-chrome.mjs': 7,
    // Standalone proof-sheet artifact CSS; rendered outside the app bundle.
    'tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.css': 7,
  })
);

const SCAN_ROOTS = ['web/src', 'scripts', 'tools'];
const SCAN_EXTENSIONS = /\.(ts|js|mjs|cjs|svelte|css|html|svg|json|md|ya?ml)$/;
const EXCLUDED_DIRS = /(^|\/)(node_modules|legacy|ideas-exploration)(\/|$)/;

function scannedFiles() {
  return SCAN_ROOTS.flatMap((root) =>
    readdirSync(join(repoRoot, root), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)))
      .filter(
        (rel) =>
          SCAN_EXTENSIONS.test(rel) &&
          !EXCLUDED_DIRS.test(rel) &&
          !/\.test\./.test(rel) &&
          rel !== 'web/src/lib/palette.ts'
      )
  );
}

export function countPaletteHexes(text) {
  return (text.replace(/var\([^)]*\)/g, 'var()').match(hexRegex) ?? []).length;
}

describe('brand palette single source', () => {
  it('extracts the palette from palette.ts', () => {
    expect(paletteHexes.length).toBeGreaterThanOrEqual(10);
  });

  it('counts hexes case-insensitively but ignores var() fallbacks', () => {
    const hex = paletteHexes[0];
    expect(countPaletteHexes(`color: #${hex.toUpperCase()}; fill: #${hex};`)).toBe(2);
    expect(countPaletteHexes(`color: var(--brand, #${hex});`)).toBe(0);
  });

  it('catches 8-digit alpha variants of a palette hex', () => {
    expect(countPaletteHexes(`border-color: #${paletteHexes[0]}cc;`)).toBe(1);
  });

  it('finds palette hexes only in allowlisted files', () => {
    const problems = [];
    const seen = new Set();
    for (const rel of scannedFiles()) {
      const count = countPaletteHexes(readFileSync(join(repoRoot, rel), 'utf8'));
      const allowed = ALLOWED.get(rel) ?? 0;
      seen.add(rel);
      if (count > allowed) {
        problems.push(
          `${rel}: ${count} palette hex(es) (allowed ${allowed}) — import from web/src/lib/palette.ts instead, or document a new entry here.`
        );
      } else if (count < allowed) {
        problems.push(
          `${rel}: ${count} palette hex(es) but allowlist says ${allowed} — lower its entry so the guard holds.`
        );
      }
    }
    for (const rel of ALLOWED.keys()) {
      if (!seen.has(rel))
        problems.push(`${rel}: allowlisted but no longer scanned — remove its entry.`);
    }
    expect(problems).toEqual([]);
  });
});
