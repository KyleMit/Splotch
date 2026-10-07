// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// tools/ shares the web size ratchet's default max-lines block. A glob that narrows, or an
// exclusion that widens, keeps `npm run lint` green while a tools file grows past the cap; this
// positive control fails instead. The cap is read from a web/src path rather than restated, so the
// control pins parity between the trees, not the number.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

const [, { max: defaultCap }] = (
  await eslint.calculateConfigForFile(join(repoRoot, 'web/src/lib/probe.ts'))
).rules['max-lines'];

const maxLinesMessages = async (fixture, lineCount) => {
  const svelte = fixture.endsWith('.svelte');
  const lines = lineCount - (svelte ? 2 : 0);
  const statements = Array.from({ length: lines }, (_, i) => `export const n${i} = ${i};\n`).join(
    ''
  );
  const source = svelte ? `<script lang="ts">\n${statements}</script>\n` : statements;
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter((message) => message.ruleId === 'max-lines');
};

// Each fixture sits beside one of the excluded paths or in a tree with its own file shape, and
// none exists on disk: ESLint reads the path only to pick the config blocks that match it.
describe('max-lines covers tools and retained web host sources at the web default cap', () => {
  it.each([
    'tools/perf/probe.mjs',
    'tools/perf/probes/probe.js',
    'tools/lib/probe.mjs',
    'tools/tests/probe.test.mjs',
    'tools/asset-gen/probe.mjs',
    'tools/asset-gen/lib/probe.ts',
    'tools/store-drawings/lib/probe.mjs',
    'migration/probes/web-host/host/probe.ts',
    'migration/probes/web-host/src/ProbeControl.tsx',
    'migration/probes/web-host/src/ProbeControl.svelte',
    'migration/probes/web-host/tests/probe.spec.ts',
  ])('rejects %s one line over the cap and accepts it at the cap', async (fixture) => {
    expect(await maxLinesMessages(fixture, defaultCap)).toEqual([]);
    expect(await maxLinesMessages(fixture, defaultCap + 1)).toEqual([
      expect.objectContaining({
        message: `File has too many lines (${defaultCap + 1}). Maximum allowed is ${defaultCap}.`,
      }),
    ]);
  });
});
