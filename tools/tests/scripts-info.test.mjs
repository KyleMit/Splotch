import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIRECT_PROVIDER_PATHS } from '../ruler/lib/direct-provider-skills.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const scriptKeys = Object.keys(packageJson.scripts);
const scriptInfoKeys = Object.keys(packageJson['scripts-info']);
const isMarkdownSource = (path) => path.endsWith('.md') || path.endsWith('.md.template');

function markdownSourcesAt(path) {
  if (statSync(path).isFile()) return isMarkdownSource(path) ? [path] : [];

  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && isMarkdownSource(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const docsRoot = join(repoRoot, 'docs');
const maintainedMarkdownSources = [
  ...markdownSourcesAt(join(repoRoot, '.ruler')),
  ...markdownSourcesAt(join(repoRoot, '.claude', 'rules')),
  ...DIRECT_PROVIDER_PATHS.flatMap((path) => markdownSourcesAt(join(repoRoot, path))),
  ...readdirSync(docsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isMarkdownSource(entry.name))
    .map((entry) => join(docsRoot, entry.name)),
];
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

  it('uses existing scripts in maintained Markdown sources', () => {
    const missing = maintainedMarkdownSources.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(literalNpmRun)]
        .map((match) => match[1])
        .filter((script) => !scriptKeys.includes(script))
        .map((script) => `${relative(repoRoot, path)}: ${script}`)
    );

    expect(missing, `Maintained sources invoke missing scripts: ${missing.join(', ')}`).toEqual([]);
  });

  it('documents the no-rebuild form for every perf command with a build prehook', () => {
    const missing = Object.entries(packageJson.scripts)
      .filter(([name, command]) => name.startsWith('preperf:') && command === 'npm run perf:build')
      .map(([name]) => name.slice('pre'.length))
      .filter((name) => !packageJson['scripts-info'][`pre${name}`].includes('--ignore-scripts'));

    expect(missing, `Perf commands missing no-rebuild guidance: ${missing.join(', ')}`).toEqual([]);
  });
});
