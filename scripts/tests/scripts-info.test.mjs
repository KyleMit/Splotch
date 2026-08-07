import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const scriptKeys = Object.keys(packageJson.scripts);
const scriptInfoKeys = Object.keys(packageJson['scripts-info']);
const rulerRoot = join(repoRoot, '.ruler');
const rulerMarkdownSources = readdirSync(rulerRoot, { withFileTypes: true, recursive: true })
  .filter(
    (entry) => entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.md.template'))
  )
  .map((entry) => join(entry.parentPath, entry.name));
const literalNpmRun = /\bnpm run ([a-z0-9][a-z0-9:.-]*)(?![a-z0-9:.*${}<>?-])/gu;

describe('package script documentation', () => {
  it('documents every script', () => {
    const missing = scriptKeys.filter((key) => !scriptInfoKeys.includes(key));

    expect(missing, `Missing scripts-info entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('describes only existing scripts', () => {
    const missing = scriptInfoKeys.filter((key) => !scriptKeys.includes(key));

    expect(missing, `Scripts-info entries without scripts: ${missing.join(', ')}`).toEqual([]);
  });

  it('uses existing scripts in Ruler Markdown sources', () => {
    const missing = rulerMarkdownSources.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(literalNpmRun)]
        .map((match) => match[1])
        .filter((script) => !scriptKeys.includes(script))
        .map((script) => `${relative(repoRoot, path)}: ${script}`)
    );

    expect(missing, `Ruler sources invoke missing scripts: ${missing.join(', ')}`).toEqual([]);
  });
});
