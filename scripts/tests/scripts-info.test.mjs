import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const scriptKeys = Object.keys(packageJson.scripts);
const scriptInfoKeys = Object.keys(packageJson['scripts-info']);

describe('package script documentation', () => {
  it('documents every script', () => {
    const missing = scriptKeys.filter((key) => !scriptInfoKeys.includes(key));

    expect(missing, `Missing scripts-info entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('describes only existing scripts', () => {
    const missing = scriptInfoKeys.filter((key) => !scriptKeys.includes(key));

    expect(missing, `Scripts-info entries without scripts: ${missing.join(', ')}`).toEqual([]);
  });
});
