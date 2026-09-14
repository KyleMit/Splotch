// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [
    {
      files: ['web/src/**/*.ts'],
      languageOptions: { parserOptions: { projectService: false } },
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
});

const violations = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) =>
      message.ruleId === 'no-restricted-syntax' && message.message.includes('navigation state')
  );
};

describe('the browser-history state guard', () => {
  it('rejects pushState in app source', async () => {
    expect(
      await violations('web/src/lib/probe.ts', "history.pushState(history.state, '', '/next');")
    ).toHaveLength(1);
  });

  it('rejects replaceState that discards the current state', async () => {
    expect(
      await violations('web/src/lib/probe.ts', "history.replaceState(null, '', '/next');")
    ).toHaveLength(1);
  });

  it('allows replaceState that preserves the current state', async () => {
    expect(
      await violations('web/src/lib/probe.ts', "history.replaceState(history.state, '', '/next');")
    ).toHaveLength(0);
  });

  it('covers Svelte components after their config block replaces the rule', async () => {
    expect(
      await violations(
        'web/src/lib/Probe.svelte',
        `<script lang="ts">history.replaceState({}, '', '/next');</script>`
      )
    ).toHaveLength(1);
  });

  it('allows direct history setup in colocated tests', async () => {
    expect(
      await violations('web/src/lib/probe.test.ts', "history.replaceState({}, '', '/next');")
    ).toHaveLength(0);
  });
});
