// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The native candidate's floating-promise fence: a type-aware block in eslint.config.js, scoped by
// glob to experiments/native-architecture/src and typed against that package's tsconfig. It is
// the fence that would have caught Expo SDK 58 turning File.write() into a promise (issue 3062).
// The rule needs a TypeScript program, so each probe lints seeded source at the path of a real
// tracked module; ESLint lints the supplied text, not the file on disk.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

const RULE = '@typescript-eslint/no-floating-promises';
const ERROR = 2;
const PROBE_PATHS = [
  'experiments/native-architecture/src/platform/sectionsSeen.ts',
  'experiments/native-architecture/src/rsdDrawing/RsdSettingsRoute.tsx',
];

const UNAWAITED_WRITE = `import { File, Paths } from 'expo-file-system';
export async function probe() {
  const file = new File(Paths.document, 'probe.txt');
  file.write('probe');
  return file.text();
}
`;

const AWAITED_WRITE = `import { File, Paths } from 'expo-file-system';
export async function probe() {
  const file = new File(Paths.document, 'probe.txt');
  await file.write('probe');
  file.writeSync('probe');
  return file.text();
}
`;

async function floatingPromises(path, source) {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, path) });
  return result.messages
    .filter((message) => message.ruleId === RULE)
    .map(({ ruleId, severity, line }) => ({ ruleId, severity, line }));
}

describe('the native candidate floating-promise fence', () => {
  it.each(PROBE_PATHS)('rejects an unawaited File.write() in %s', async (path) => {
    expect(await floatingPromises(path, UNAWAITED_WRITE)).toEqual([
      { ruleId: RULE, severity: ERROR, line: 4 },
    ]);
  });

  it.each(PROBE_PATHS)('accepts an awaited write and writeSync() in %s', async (path) => {
    expect(await floatingPromises(path, AWAITED_WRITE)).toEqual([]);
  });
});
