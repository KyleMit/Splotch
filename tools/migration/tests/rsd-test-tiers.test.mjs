import { execFileSync } from 'node:child_process';
import { dirname, matchesGlob, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createVitest } from 'vitest/node';
import { RSD_NATIVE_RENDERER_TESTS } from '../lib/rsd-drawing-checks.mjs';

// Each tier's membership comes from Vitest's own test-file discovery over its real config, so a
// test named for the native renderer that one tier stops collecting, or both start collecting,
// fails here by name — whatever spelling the include or exclude glob uses.
const RSD_TIER = 'test:migration:rsd-selection';
const TOOLS_TIER = 'test:tools';
const configPath = (path) => fileURLToPath(new URL(path, import.meta.url));
const TIER_CONFIGS = {
  [TOOLS_TIER]: configPath('../../vitest.config.mjs'),
  [RSD_TIER]: configPath('../rsd-drawing-vitest.config.mjs'),
};
const root = dirname(TIER_CONFIGS[TOOLS_TIER]);

async function discover(config) {
  const vitest = await createVitest({ config, watch: false, reporters: [] });
  try {
    const specs = await vitest.globTestSpecifications();
    return new Set(specs.map(({ moduleId }) => relative(root, moduleId)));
  } finally {
    await vitest.close();
  }
}

const collected = Object.fromEntries(
  await Promise.all(
    Object.entries(TIER_CONFIGS).map(async ([tier, config]) => [tier, await discover(config)])
  )
);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const rsdNamed = files.filter((file) => matchesGlob(file, RSD_NATIVE_RENDERER_TESTS));
const tiersOf = (file) => Object.keys(TIER_CONFIGS).filter((tier) => collected[tier].has(file));

it('places this guard in the tools tier', () => {
  expect(tiersOf(relative(root, import.meta.filename))).toEqual([TOOLS_TIER]);
});

it('finds the RSD renderer tests it guards', () => {
  expect(rsdNamed.length).toBeGreaterThan(0);
});

it.each(rsdNamed)('%s runs in the RSD renderer tier only', (file) => {
  expect(tiersOf(file)).toEqual([RSD_TIER]);
});

it('collects nothing for the RSD renderer tier that the pattern does not name', () => {
  expect([...collected[RSD_TIER]].filter((file) => !rsdNamed.includes(file))).toEqual([]);
});
