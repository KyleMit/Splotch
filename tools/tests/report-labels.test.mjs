import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// An in-app report files a GitHub issue with the labels web/src/lib/server/report.ts
// writes, and GitHub silently auto-creates any label the repo lacks. A label
// renamed in .github/labels.yml would leave reports under a stray label nobody
// triages, so this reads both sides as written and fails on a mismatch. Each
// source pattern is anchored at a line's start on code, so a comment cannot match.
const repoRoot = join(import.meta.dirname, '..', '..');
const reportSource = readFileSync(
  join(repoRoot, 'web', 'src', 'lib', 'server', 'report.ts'),
  'utf8'
);
const labelsYaml = readFileSync(join(repoRoot, '.github', 'labels.yml'), 'utf8');

const LABEL_WRITE = 'labels: [REPORT_LABEL, ISSUE_BY_KIND[reportKind].label],';

function parseTaxonomyNames(yamlText) {
  const entryCount = yamlText.match(/^- /gm)?.length ?? 0;
  const names = [...yamlText.matchAll(/^- name: '([^'\n]+)'$/gm)].map((match) => match[1]);
  if (names.length !== entryCount) {
    throw new Error(`labels.yml has ${entryCount} entries but ${names.length} single-quoted names`);
  }
  return new Set(names);
}

function parseReportLabel(source) {
  const match = source.match(/^const REPORT_LABEL = '([^'\n]+)';$/m);
  if (!match) throw new Error('report.ts no longer declares REPORT_LABEL as a string literal');
  return match[1];
}

function parseKindLabels(source) {
  const block = source.match(/^const ISSUE_BY_KIND\b[^\n]*\{\n([\s\S]*?)^\};$/m);
  if (!block) throw new Error('report.ts no longer declares ISSUE_BY_KIND as an object literal');
  return block[1]
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const entry = line.match(/^ {2}([a-z]+): \{ label: '([^'\n]+)',/);
      if (!entry) throw new Error(`ISSUE_BY_KIND line is not a one-line entry: ${line}`);
      return { kind: entry[1], label: entry[2] };
    });
}

const taxonomy = parseTaxonomyNames(labelsYaml);

describe('in-app report labels', () => {
  it('writes only REPORT_LABEL and the kind label, so the parsed labels are every label written', () => {
    const labelWrites = reportSource
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('labels:'));
    expect(labelWrites).toEqual([LABEL_WRITE]);
  });

  it('files every report under labels .github/labels.yml defines', () => {
    const kindLabels = parseKindLabels(reportSource);
    expect(kindLabels.length).toBeGreaterThan(0);
    const written = [parseReportLabel(reportSource), ...kindLabels.map(({ label }) => label)];
    expect(written.filter((label) => !taxonomy.has(label))).toEqual([]);
  });
});
