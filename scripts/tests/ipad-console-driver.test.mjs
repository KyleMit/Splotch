import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// The console driver is a paste-into-Safari snippet, so it can't import the keys
// it shares with the desktop harness. Both sides declare them as `key: '...'`
// object literals, and the whole point of matching is that a row found hot on
// the iPad names the `npm run perf:undo --scenarios=` run that reproduces it on
// the desktop — a renamed key there would silently break that handoff.
const scenarioKeys = (source) => [...source.matchAll(/^\s*key: '([a-z-]+)',$/gm)].map((m) => m[1]);

describe('iPad console driver scenario keys', () => {
  const driverKeys = scenarioKeys(read('scripts/perf/ipad-console-driver.js'));
  const harnessKeys = scenarioKeys(read('scripts/perf/undo-scenarios.mjs'));

  it('extracts keys from both sides', () => {
    expect(driverKeys.length).toBeGreaterThan(0);
    expect(harnessKeys.length).toBeGreaterThan(0);
  });

  it('is a subset of the perf:undo scenario keys', () => {
    expect(harnessKeys).toEqual(expect.arrayContaining(driverKeys));
  });

  it('declares no duplicate keys', () => {
    expect(new Set(driverKeys).size).toBe(driverKeys.length);
  });
});
