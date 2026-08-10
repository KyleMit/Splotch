import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// web/buildVersion.test.ts sits at the web root, beside the build-time module it
// tests, which puts it outside two globs that only cover src/: Vitest's collection
// include (web/vitest.config.ts) and the type-check include SvelteKit generates
// into .svelte-kit/tsconfig.json, restated in web/tsconfig.json.
//
// Dropping either glob is silent. Without the Vitest entry the root tests stop
// being collected and the suite still reports green; without the tsconfig entry
// svelte-check skips the files and still reports zero errors. So the guard cannot
// live in a web-root test — that file is itself collected by the glob it would be
// guarding. It runs here, in the tools suite, which reaches both configs as
// plain files.
//
// Regex-level for vitest.config.ts on purpose: no TypeScript parser runs in this
// Node-only suite, and importing that config would pull in the SvelteKit plugin.
const repoRoot = join(import.meta.dirname, '..', '..');

const VITEST_ROOT_TEST_GLOB = '*.test.ts';
const TSCONFIG_ROOT_TEST_GLOB = `./${VITEST_ROOT_TEST_GLOB}`;

const vitestIncludeGlobs = () => {
  const source = readFileSync(join(repoRoot, 'web', 'vitest.config.ts'), 'utf8');
  const include = /\binclude:\s*\[([^\]]*)\]/.exec(source);
  expect(include, 'web/vitest.config.ts declares a test.include array').not.toBeNull();
  return [...include[1].matchAll(/'([^']*)'/g)].map((match) => match[1]);
};

const tsconfigIncludeGlobs = () => {
  const source = readFileSync(join(repoRoot, 'web', 'tsconfig.json'), 'utf8');
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')).include;
};

describe('web-root unit tests', () => {
  it('are collected by Vitest', () => {
    expect(vitestIncludeGlobs()).toContain(VITEST_ROOT_TEST_GLOB);
  });

  it('are type-checked by svelte-check', () => {
    expect(tsconfigIncludeGlobs()).toContain(TSCONFIG_ROOT_TEST_GLOB);
  });
});
