import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// The console driver is a paste-into-Safari snippet, so it can't import the keys
// it shares with the desktop harness. Both sides declare them as `key: '...'`
// object literals, and the whole point of matching is that a row found hot on
// the iPad names the `npm run perf:undo --scenarios=` run that reproduces it on
// the desktop — a renamed key there would silently break that handoff.
const scenarioKeys = (source) => [...source.matchAll(/^\s*key: '([a-z-]+)',$/gm)].map((m) => m[1]);

// The driver's only interface is globals an operator types into the Safari
// console before pasting it, so one that isn't in the runbook is one nobody can
// find. The runbook is the .ruler/ source; ruler:check gates the two generated
// copies.
const perfGlobals = (source) =>
  [...new Set([...source.matchAll(/window\.(__perf[A-Za-z]+)/g)].map((m) => m[1]))].sort();

describe('iPad console driver operator globals', () => {
  const driver = read('scripts/perf/ipad-console-driver.js');
  // __perfRows is an output the driver writes, not an input to document.
  const inputs = perfGlobals(driver).filter((g) => g !== '__perfRows');
  const runbook = read('.ruler/skills/profiling/ipad-device-profiling.md');

  // Guards the extraction itself: if the regex stops matching, `inputs` empties
  // and the per-global cases below silently vanish instead of failing.
  it('finds the known mode switches', () => {
    expect(inputs).toEqual(
      expect.arrayContaining(['__perfOps', '__perfScenarios', '__perfStrokes', '__perfTimeline'])
    );
  });

  it.each(inputs)('documents window.%s in the runbook', (name) => {
    expect(runbook).toContain(name);
  });
});

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
