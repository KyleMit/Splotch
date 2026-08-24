// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAFE_AREA_EDGES, SAFE_AREA_PROPERTIES } from './safeArea';

// Two sides of one agreement that no import can carry: app.css seeds the four
// inset custom properties from env(), and every other consumer in the app reads
// them back through var(). A consumer that calls env() directly still renders
// correctly on a real device — which is exactly why nothing else would catch it —
// but becomes invisible to the /dev/notch harness, whose whole mechanism is
// re-declaring these properties on a subtree. So the second test below is the
// load-bearing one: it fails the moment an inset consumer leaves the seam.

const srcDir = new URL('../../', import.meta.url).pathname;
const appCss = readFileSync(join(srcDir, 'app.css'), 'utf8');

// The seed block is the sole legitimate env() call site, so it is excluded from
// the sweep by matching it exactly rather than by line number.
const SEED_PATTERN = /--safe-area-(top|right|bottom|left):\s*env\(safe-area-inset-\1,\s*0px\)/g;

const CALL_PATTERN = /env\(safe-area-inset-(top|right|bottom|left)\)/;

function collectSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectSources(path, found);
    else if (/\.(svelte|css|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

describe('safe-area inset custom properties', () => {
  it('app.css seeds every edge from its env() counterpart', () => {
    const seeded = [...appCss.matchAll(SEED_PATTERN)].map((match) => match[1]);
    expect(seeded.sort()).toEqual([...SAFE_AREA_EDGES].sort());
    for (const edge of SAFE_AREA_EDGES) {
      expect(appCss).toContain(`${SAFE_AREA_PROPERTIES[edge]}: env(safe-area-inset-${edge}, 0px)`);
    }
  });

  it('no source outside that seed calls env(safe-area-inset-*) directly', () => {
    const offenders = collectSources(srcDir)
      .map((path) => ({ path, body: readFileSync(path, 'utf8').replace(SEED_PATTERN, '') }))
      // Only a real edge name is a call. Comments and page copy discuss the
      // function this seam wraps — `env(safe-area-inset-*)` with a literal star
      // is prose, not CSS, and explaining the seam is worth more than a
      // mechanical ban on naming it.
      .filter(({ body }) => CALL_PATTERN.test(stripComments(body)))
      .map(({ path }) => path.slice(srcDir.length));
    expect(offenders).toEqual([]);
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
