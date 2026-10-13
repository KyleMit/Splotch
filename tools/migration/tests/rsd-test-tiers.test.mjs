import { execFileSync } from 'node:child_process';
import { matchesGlob, relative } from 'node:path';
import { expect, it } from 'vitest';
import toolsConfig from '../../vitest.config.mjs';
import rsdConfig from '../rsd-drawing-vitest.config.mjs';
import { RSD_NATIVE_RENDERER_TESTS } from '../lib/rsd-drawing-checks.mjs';

// Each tier's selection, evaluated from its own config object, so a test named for the native
// renderer that one config stops selecting, or both start selecting, fails here by name.
const RSD_TIER = 'test:migration:rsd-selection';
const TOOLS_TIER = 'test:tools';
const toolsProject = toolsConfig.test.projects.find(({ test }) => test.name === 'repo-tools');
const TIERS = {
  [TOOLS_TIER]: { root: toolsProject.root, ...toolsProject.test },
  [RSD_TIER]: { root: rsdConfig.root, ...rsdConfig.test },
};
const root = rsdConfig.root;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const rsdNamed = files.filter((file) => matchesGlob(file, RSD_NATIVE_RENDERER_TESTS));

const matchesAny = (file, globs = []) => globs.some((glob) => matchesGlob(file, glob));
const tiersOf = (file) =>
  Object.entries(TIERS)
    .filter(([, tier]) => matchesAny(file, tier.include) && !matchesAny(file, tier.exclude))
    .map(([name]) => name);

it('reads both tiers relative to the one root the pattern is written against', () => {
  expect(TIERS[TOOLS_TIER].root).toBe(root);
});

it('places this guard in the tools tier', () => {
  expect(tiersOf(relative(root, import.meta.filename))).toEqual([TOOLS_TIER]);
});

it('finds the RSD renderer tests it guards', () => {
  expect(rsdNamed.length).toBeGreaterThan(0);
});

it.each(rsdNamed)('%s runs in the RSD renderer tier only', (file) => {
  expect(tiersOf(file)).toEqual([RSD_TIER]);
});

it('selects nothing for the RSD renderer tier that the pattern does not name', () => {
  expect(
    files.filter((file) => tiersOf(file).includes(RSD_TIER) && !rsdNamed.includes(file))
  ).toEqual([]);
});
