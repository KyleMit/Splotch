import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const filename = join(repoRoot, 'experiments/native-architecture/src/LintControl.tsx');
const eslint = new ESLint({ cwd: repoRoot });
async function ruleIds(source) {
  const results = await eslint.lintText(source, { filePath: filename });
  return results[0].messages.map((message) => message.ruleId);
}

describe('candidate TSX convention fences', () => {
  it('rejects any, default exports, type-only value imports and mutable constants', async () => {
    expect(await ruleIds('export const value: any = 1;')).toContain(
      '@typescript-eslint/no-explicit-any'
    );
    expect(await ruleIds('export default function View() { return null; }')).toContain(
      'no-restricted-syntax'
    );
    expect(
      await ruleIds("import { ReactNode } from 'react'; export const value: ReactNode = null;")
    ).toContain('@typescript-eslint/consistent-type-imports');
    expect(await ruleIds('export function value() { let result = 1; return result; }')).toContain(
      'prefer-const'
    );
  });

  it('enforces builtin node protocol and inherited file/function caps', async () => {
    expect(
      await ruleIds("import { readFileSync } from 'fs'; export const read = readFileSync;")
    ).toContain('no-restricted-imports');
    const config = await eslint.calculateConfigForFile(filename);
    const fileLimit = config.rules['max-lines'][1].max;
    const functionLimit = config.rules['max-lines-per-function'][1].max;
    expect(
      await ruleIds(
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
    expect(await ruleIds(`export function longFunction() {\n${statements}\n}`)).toContain(
      'max-lines-per-function'
    );
  });
});
