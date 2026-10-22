import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';

// ADR-0179 keeps Reanimated (and the worklets runtime under it) out of the web export: a primitive
// that slides on the UI thread natively carries a .web variant that animates with CSS instead.
// This walks the app's module graph from its entry the way Metro resolves it for each platform,
// following static and dynamic imports alike, since a lazy chunk is still precached.
const APP = join(ROOT, '.');
const ENTRY = join(APP, 'src/index.ts');
const REANIMATED = /^react-native-(?:reanimated|worklets)(?:\/|$)/;
const IMPORT =
  /(?:\bimport\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?|\bexport\s+(?:type\s+)?[^'";]*?\s+from\s+|\bimport\s*\(\s*)'([^']+)'/g;
const PLATFORM_EXTENSIONS = {
  web: ['.web.tsx', '.web.ts', '.tsx', '.ts'],
  native: ['.native.tsx', '.native.ts', '.tsx', '.ts'],
};

function resolveModule(from, specifier, platform) {
  const base = resolve(dirname(from), specifier);
  if (/\.[cm]?[jt]sx?$/.test(specifier) && existsSync(base)) return base;
  const candidates = PLATFORM_EXTENSIONS[platform].flatMap((extension) => [
    `${base}${extension}`,
    join(base, `index${extension}`),
  ]);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function importsOf(path) {
  const source = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return [...source.matchAll(IMPORT)]
    .filter(([statement]) => !/^\s*(?:import|export)\s+type\b/.test(statement))
    .map(([, specifier]) => specifier);
}

// Every app module that imports Reanimated on the given platform, with the chain that reached it.
function reanimatedImporters(platform) {
  const seen = new Map([[ENTRY, null]]);
  const queue = [ENTRY];
  const importers = [];
  while (queue.length) {
    const path = queue.shift();
    for (const specifier of importsOf(path)) {
      if (REANIMATED.test(specifier)) importers.push(path);
      if (!specifier.startsWith('.')) continue;
      const next = resolveModule(path, specifier, platform);
      if (!next || seen.has(next)) continue;
      seen.set(next, path);
      queue.push(next);
    }
  }
  return importers.map((path) => {
    const chain = [];
    for (let at = path; at; at = seen.get(at)) chain.unshift(relative(APP, at));
    return chain.join(' -> ');
  });
}

describe('Reanimated in the web export', () => {
  it('is imported by no module the web export reaches', () => {
    expect(reanimatedImporters('web')).toEqual([]);
  });

  it('is found by the same walk where the native apps do import it', () => {
    const native = reanimatedImporters('native');
    expect(native.some((chain) => chain.endsWith('src/rsdDrawing/segmentThumb.tsx'))).toBe(true);
    expect(native.some((chain) => chain.endsWith('src/rsdDrawing/RsdToggleSwitch.tsx'))).toBe(true);
  });
});
