import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const filenames = [
  'experiments/native-architecture/src/LintControl.tsx',
  'migration/probes/web-host/src/LintControl.tsx',
].map((path) => join(repoRoot, path));
const eslint = new ESLint({ cwd: repoRoot });
async function ruleIds(source, filename) {
  const results = await eslint.lintText(source, { filePath: filename });
  return results[0].messages.map((message) => message.ruleId);
}

describe.each(filenames)('candidate TSX convention fences for %s', (filename) => {
  const rulesFor = (source) => ruleIds(source, filename);
  it('rejects any, default exports, type-only value imports and mutable constants', async () => {
    expect(await rulesFor('export const value: any = 1;')).toContain(
      '@typescript-eslint/no-explicit-any'
    );
    expect(await rulesFor('export default function View() { return null; }')).toContain(
      'no-restricted-syntax'
    );
    expect(
      await rulesFor("import { ReactNode } from 'react'; export const value: ReactNode = null;")
    ).toContain('@typescript-eslint/consistent-type-imports');
    expect(await rulesFor('export function value() { let result = 1; return result; }')).toContain(
      'prefer-const'
    );
  });

  it('enforces builtin node protocol and inherited file/function caps', async () => {
    expect(
      await rulesFor("import { readFileSync } from 'fs'; export const read = readFileSync;")
    ).toContain('no-restricted-imports');
    const config = await eslint.calculateConfigForFile(filename);
    const fileLimit = config.rules['max-lines'][1].max;
    const functionLimit = config.rules['max-lines-per-function'][1].max;
    expect(
      await rulesFor(
        Array.from(
          { length: fileLimit + 1 },
          (_, index) => `export const value${index} = ${index};`
        ).join('\n')
      )
    ).toContain('max-lines');
    const statements = Array.from(
      { length: functionLimit + 1 },
      (_, index) => `  console.log(${index});`
    ).join('\n');
    expect(await rulesFor(`export function longFunction() {\n${statements}\n}`)).toContain(
      'max-lines-per-function'
    );
  });
});
