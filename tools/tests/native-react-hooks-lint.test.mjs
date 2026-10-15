// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The native candidate's hooks fence: two rules from eslint-plugin-react-hooks, scoped by glob to
// experiments/native-architecture/src. Each case lints a seeded violation through the real config
// at a plain and a platform-suffixed path, in .ts and .tsx, so a glob that narrows or a rule that
// stops firing fails here instead of reading as a clean tree.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

const ERROR = 2;
const HOOKS_RULES = ['react-hooks/exhaustive-deps', 'react-hooks/rules-of-hooks'];

// None of these paths exist on disk; ESLint reads a path only to pick the config blocks for it.
const PROBE_PATHS = [
  'experiments/native-architecture/src/probe/useLintProbe.ts',
  'experiments/native-architecture/src/probe/LintProbe.tsx',
  'experiments/native-architecture/src/probe/useLintProbe.native.ts',
  'experiments/native-architecture/src/probe/useLintProbe.android.ts',
  'experiments/native-architecture/src/probe/LintProbe.web.tsx',
  'experiments/native-architecture/src/probe/LintProbe.ios.tsx',
];

const CONDITIONAL_HOOK = `import { useState } from 'react';
export function useLintProbe(enabled: boolean) {
  if (!enabled) return 0;
  const [value] = useState(0);
  return value;
}
`;

const MISSING_DEPENDENCY = `import { useEffect } from 'react';
export function useLintProbe(value: number, report: (value: number) => void) {
  useEffect(() => {
    report(value);
  }, []);
}
`;

const COMPLETE_DEPENDENCIES = `import { useEffect, useState } from 'react';
export function useLintProbe(value: number, report: (value: number) => void) {
  const [seen] = useState(value);
  useEffect(() => {
    report(seen);
  }, [seen, report]);
}
`;

async function hooksMessages(path, source) {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, path) });
  return result.messages
    .filter((message) => HOOKS_RULES.includes(message.ruleId))
    .map(({ ruleId, severity }) => ({ ruleId, severity }));
}

describe('the native candidate hooks fence', () => {
  it.each(PROBE_PATHS)('rejects a conditionally called hook in %s', async (path) => {
    expect(await hooksMessages(path, CONDITIONAL_HOOK)).toEqual([
      { ruleId: 'react-hooks/rules-of-hooks', severity: ERROR },
    ]);
  });

  it.each(PROBE_PATHS)('rejects an effect missing a dependency in %s', async (path) => {
    expect(await hooksMessages(path, MISSING_DEPENDENCY)).toEqual([
      { ruleId: 'react-hooks/exhaustive-deps', severity: ERROR },
    ]);
  });

  it.each(PROBE_PATHS)('accepts hooks that follow both rules in %s', async (path) => {
    expect(await hooksMessages(path, COMPLETE_DEPENDENCIES)).toEqual([]);
  });

  it('enables exactly the two classic rules, none of the compiler preset', async () => {
    const config = await eslint.calculateConfigForFile(join(repoRoot, PROBE_PATHS[0]));
    const enabled = Object.entries(config.rules)
      .filter(([rule, [severity]]) => rule.startsWith('react-hooks/') && severity !== 0)
      .map(([rule, [severity]]) => [rule, severity])
      .sort(([a], [b]) => a.localeCompare(b));
    expect(enabled).toEqual(HOOKS_RULES.map((rule) => [rule, ERROR]));
  });
});
