// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every Netlify Blobs store names its consistency mode, because the SDK's default (eventual) is the
// mode that broke free-generation grants (ADR-0105). The guard is a pair of no-restricted-syntax
// selectors, and flat config REPLACES that rule's entry wherever a later block configures it, so
// this control seeds each omission into the file shapes that can open a store.
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

const violations = async (fixture, call) => {
  const source = `import { getStore } from '@netlify/blobs';\n${call};\n`;
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) =>
      message.ruleId === 'no-restricted-syntax' && message.message.includes('getStore({ name')
  );
};

describe('the Blobs consistency guard', () => {
  it.each([
    ['a string store name', "getStore('ai-usage')"],
    ['a store name constant', 'getStore(STORE_NAME)'],
    ['no arguments', 'getStore()'],
    ['an options object without consistency', 'getStore({ name: STORE_NAME })'],
    ['a spread of options', 'getStore({ ...options })'],
    // The SDK treats an undefined mode as no mode, so a named-but-unset one is the same omission.
    ['an undefined consistency', 'getStore({ name: STORE_NAME, consistency: undefined })'],
    ['a consistency variable', 'getStore({ name: STORE_NAME, consistency: mode })'],
    ['a shorthand consistency', 'getStore({ name: STORE_NAME, consistency })'],
  ])('rejects %s', async (_shape, call) => {
    expect(await violations('web/src/lib/server/probe.ts', call)).toHaveLength(1);
  });

  it.each([
    ['eventual', "getStore({ name: STORE_NAME, consistency: 'eventual' })"],
    ['strong', "getStore({ name: STORE_NAME, consistency: 'strong' })"],
  ])('allows an explicit %s mode', async (_mode, call) => {
    expect(await violations('web/src/lib/server/probe.ts', call)).toHaveLength(0);
  });

  it('rejects an omission in a route module', async () => {
    expect(
      await violations('web/src/routes/api/probe/+server.ts', "getStore('ai-usage')")
    ).toHaveLength(1);
  });

  it('rejects an omission in the storage seam, which recomposes the web/src set', async () => {
    expect(await violations('web/src/lib/storage.ts', "getStore('ai-usage')")).toHaveLength(1);
  });
});
