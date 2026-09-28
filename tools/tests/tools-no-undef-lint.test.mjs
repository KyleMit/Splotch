// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// No TypeScript program covers tools/, so no-undef is the only check between a dropped import and
// a ReferenceError at CLI runtime. That bug has shipped outside tools/asset-gen: an app driver
// called sleep() without importing it, and perf:mount called join() the same way. This fails if
// the eslint.config.js glob narrows back to a subtree.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

const undefinedNames = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages
    .filter((message) => message.ruleId === 'no-undef')
    .map((message) => message.message);
};

describe('no-undef covers every tools/ script', () => {
  it.each([
    'tools/perf/probe.mjs',
    'tools/lib/probe.mjs',
    'tools/asset-gen/probe.mjs',
    'tools/perf/probes/probe.js',
    'tools/asset-gen/lib/probe.ts',
  ])('rejects an unimported binding in %s', async (fixture) => {
    expect(await undefinedNames(fixture, 'await sleep(1);\n')).toEqual(["'sleep' is not defined."]);
  });

  // Node strips the types from a tools/ .ts module and runs it, so only its runtime bindings
  // matter — a lib type name is not a missing import.
  it('accepts lib type names in a type-stripped module', async () => {
    const source = 'export type Parsed = Record<string, ReturnType<typeof setTimeout>>;\n';
    expect(await undefinedNames('tools/asset-gen/lib/probe.ts', source)).toEqual([]);
  });

  // A Node script's page.evaluate() callback runs in the browser, so both global sets are real.
  it('accepts Node and browser globals in one script', async () => {
    const source =
      'console.log(process.argv);\n' +
      'export const read = (page) => page.evaluate(() => window.innerWidth);\n';
    expect(await undefinedNames('tools/perf/probe.mjs', source)).toEqual([]);
  });
});
