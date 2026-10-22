// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// tools/ shares the web size ratchet's default max-lines block. A glob that narrows, or an
// exclusion that widens, keeps `npm run lint` green while a tools file grows past the cap; this
// positive control fails instead. The cap is read from a src path rather than restated, so the
// control pins parity between the trees, not the number.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parserOptions: { projectService: false, project: null } },
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
});

const [, { max: defaultCap }] = (
  await eslint.calculateConfigForFile(join(repoRoot, 'src/lib/probe.ts'))
).rules['max-lines'];

const maxLinesMessages = async (fixture, lineCount) => {
  const source = Array.from({ length: lineCount }, (_, i) => `export const n${i} = ${i};\n`);
  const [result] = await eslint.lintText(source.join(''), { filePath: join(repoRoot, fixture) });
  return result.messages.filter((message) => message.ruleId === 'max-lines');
};

// Each fixture sits beside one of the excluded paths or in a tree with its own file shape, and
// none exists on disk: ESLint reads the path only to pick the config blocks that match it.
describe('max-lines covers every tools/ script at the web default cap', () => {
  it.each([
    'tools/perf/probe.mjs',
    'tools/perf/probes/probe.js',
    'tools/lib/probe.mjs',
    'tools/tests/probe.test.mjs',
    'tools/asset-gen/probe.mjs',
    'tools/asset-gen/lib/probe.ts',
    'tools/store-drawings/lib/probe.mjs',
  ])('rejects %s one line over the cap and accepts it at the cap', async (fixture) => {
    expect(await maxLinesMessages(fixture, defaultCap)).toEqual([]);
    expect(await maxLinesMessages(fixture, defaultCap + 1)).toEqual([
      expect.objectContaining({
        message: `File has too many lines (${defaultCap + 1}). Maximum allowed is ${defaultCap}.`,
      }),
    ]);
  });
});

describe('the function-size ratchet follows moved shared modules', () => {
  it.each([
    'src/ai/probe.ts',
    'netlify/server/probe.ts',
    'tools/icons/lib/probe.ts',
    'tools/marketing-assets/lib/page/probe.ts',
    'tools/migration/lib/safeAreaMatrix/probe.ts',
    'tools/store-drawings/lib/probe.ts',
  ])('rejects %s above the app function cap and accepts it at the cap', async (fixture) => {
    const config = await eslint.calculateConfigForFile(join(repoRoot, 'src/ai/probe.ts'));
    const [, { max }] = config.rules['max-lines-per-function'];
    const messages = async (lines) => {
      const source = [
        'export function probe() {',
        ...Array.from({ length: lines - 2 }, (_, index) => `console.log(${index});`),
        '}',
      ].join('\n');
      const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
      return result.messages.filter(({ ruleId }) => ruleId === 'max-lines-per-function');
    };
    expect(await messages(max)).toHaveLength(0);
    expect(await messages(max + 1)).toHaveLength(1);
  });
});
