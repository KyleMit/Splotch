import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ALL_UNDO_SCENARIO_KEYS } from '../perf/undo-scenario-keys.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// The console driver is a paste-into-Safari snippet, so it can't import the
// desktop harness's key manifest. A row found hot on the iPad must still name the
// `npm run perf:undo --scenarios=` run that reproduces it on the desktop.
const scenarioKeys = (source) => [...source.matchAll(/^\s*key: '([a-z-]+)',$/gm)].map((m) => m[1]);

// The driver's only interface is globals an operator types into the Safari
// console before pasting it, so one that isn't in the runbook is one nobody can
// find.
const perfGlobals = (source) =>
  [...new Set([...source.matchAll(/window\.(__perf[A-Za-z]+)/g)].map((m) => m[1]))].sort();

describe('iPad console driver operator globals', () => {
  const driver = read('scripts/perf/ipad-console-driver.js');
  // __perfRows is an output the driver writes, not an input to document.
  const inputs = perfGlobals(driver).filter((g) => g !== '__perfRows');
  const runbook = read('docs/PROFILING-IPAD.md');

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

  it('extracts keys from the standalone driver', () => {
    expect(driverKeys.length).toBeGreaterThan(0);
  });

  it('is a subset of the perf:undo scenario keys', () => {
    expect(ALL_UNDO_SCENARIO_KEYS).toEqual(expect.arrayContaining(driverKeys));
  });

  it('declares no duplicate keys', () => {
    expect(new Set(driverKeys).size).toBe(driverKeys.length);
  });
});
