// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The web/src named-exports ban lives in no-restricted-syntax, and flat config REPLACES that
// rule's entry wherever a later block configures it — the Svelte-flavoured and Vitest blocks
// both do. Each is followed by a web/src-scoped block that recomposes the ban into its selector
// set, and this control seeds a default export into every file shape so a recomposition that
// silently drops the selector fails here instead of shipping an unenforced invariant.
const repoRoot = join(import.meta.dirname, '..', '..');
// The type-aware no-floating-promises block runs a TS project service over web/src/**/*.ts,
// which fatals on a virtual path instead of running any rules. It is orthogonal to what this
// control pins, so the override switches that one layer off for the probe paths.
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

// None of these paths exist on disk — ESLint reads a file path only to pick the config blocks
// that match it.
const NAMED_EXPORTS_MESSAGE = 'named exports only';

const namedExportViolations = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) =>
      message.ruleId === 'no-restricted-syntax' && message.message.includes(NAMED_EXPORTS_MESSAGE)
  );
};

describe('the web/src named-exports ban covers every file shape', () => {
  it('rejects a default export in ordinary web/src TS', async () => {
    expect(await namedExportViolations('web/src/lib/probe.ts', 'export default 1;')).toHaveLength(
      1
    );
  });

  it('rejects a default export in a rune module, where the Svelte block replaced the entry', async () => {
    expect(
      await namedExportViolations('web/src/lib/probe.svelte.ts', 'export default 1;')
    ).toHaveLength(1);
  });

  it('rejects a default export in a colocated unit test, where the Vitest block replaced the entry', async () => {
    expect(
      await namedExportViolations('web/src/lib/probe.test.ts', 'export default 1;')
    ).toHaveLength(1);
  });

  it('allows a named export in web/src', async () => {
    expect(
      await namedExportViolations('web/src/lib/probe.ts', 'export const one = 1;')
    ).toHaveLength(0);
  });

  it('leaves default exports outside web/src alone — configs and tools use them', async () => {
    expect(await namedExportViolations('tools/probe.mjs', 'export default 1;')).toHaveLength(0);
  });
});
