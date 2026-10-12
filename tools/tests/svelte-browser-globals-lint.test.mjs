// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

const violations = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) => message.ruleId === 'svelte/no-top-level-browser-globals'
  );
};

// The first lint of a web/src/**/*.ts path builds the type-aware project service for the whole
// web/ program (the no-floating-promises block in eslint.config.js), which takes seconds on a
// loaded runner and would otherwise land inside one test's own timeout.
const PROJECT_SERVICE_WARMUP_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  await violations('web/src/lib/state/warmup.svelte.ts', 'export const warm = 0;');
}, PROJECT_SERVICE_WARMUP_TIMEOUT_MS);

describe('the top-level browser-global guard', () => {
  it('rejects a browser-global read during Svelte component initialization', async () => {
    expect(
      await violations(
        'web/src/lib/Probe.svelte',
        '<script lang="ts">const width = window.innerWidth;</script>'
      )
    ).toHaveLength(1);
  });

  it('rejects a browser-global read at the top level of a rune module', async () => {
    expect(
      await violations(
        'web/src/lib/state/network.svelte.ts',
        'export const width = window.innerWidth;'
      )
    ).toHaveLength(1);
  });

  it('allows a top-level browser read guarded by SvelteKit environment state', async () => {
    expect(
      await violations(
        'web/src/lib/state/network.svelte.ts',
        "import { browser } from '$app/environment'; export const width = browser ? window.innerWidth : 0;"
      )
    ).toHaveLength(0);
  });

  it('allows browser access inside a function that runs only when called', async () => {
    expect(
      await violations(
        'web/src/lib/Probe.svelte',
        '<script lang="ts">function width() { return window.innerWidth; }</script>'
      )
    ).toHaveLength(0);
  });
});
