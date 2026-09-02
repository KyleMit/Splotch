import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { playwrightReportFolder } from '../../web/playwright.shared.ts';

// playwright.shared.ts pins the folder both Playwright reporters write to, and
// test.yml uploads it by a literal path YAML cannot import. This is the guard
// against the two drifting apart: a moved folder would leave every Playwright
// job uploading nothing (if-no-files-found: error) — or, worse, an old copy.

const repoRoot = join(import.meta.dirname, '..', '..');
const workflowLines = readFileSync(
  join(repoRoot, '.github', 'workflows', 'test.yml'),
  'utf8'
).split('\n');
const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n');

const indentOf = (line) => line.match(/^ */)[0].length;

/**
 * Every upload-artifact step as its own `{ name, path }`, each read only from
 * that step's `with:` block — never borrowed from a neighbouring step or job.
 */
function uploadArtifactSteps(lines) {
  const steps = [];
  for (const [index, line] of lines.entries()) {
    if (!/^\s+(- )?uses: actions\/upload-artifact/.test(line)) continue;
    const stepIndent = line.indexOf('uses:');
    const step = { name: undefined, path: undefined };
    for (const next of lines.slice(index + 1)) {
      const blank = next.trim() === '';
      const leavesStep = !blank && (indentOf(next) < stepIndent || /^\s+- /.test(next));
      if (leavesStep) break;
      step.name ??= next.match(/^\s+name: (\S+)$/)?.[1];
      step.path ??= next.match(/^\s+path: (\S+)$/)?.[1];
    }
    steps.push(step);
  }
  return steps;
}

describe('Playwright report folder', () => {
  const folder = relative(repoRoot, playwrightReportFolder);
  const reportUploads = uploadArtifactSteps(workflowLines).filter(({ name }) =>
    name?.startsWith('playwright-report-')
  );

  it('is what every Playwright job in test.yml uploads', () => {
    expect(reportUploads.length).toBeGreaterThan(0);
    for (const { name, path } of reportUploads)
      expect({ name, path }).toEqual({ name, path: `${folder}/` });
  });

  it('is gitignored, so the per-run record never churns the working tree', () => {
    expect(gitignore).toContain(`/${folder}/`);
  });
});

describe('upload-artifact step parsing', () => {
  // A lookup that ran past a step's own `with:` block paired one artifact name
  // with the next step's path and still satisfied the assertion above.
  it('reads a path only from the step that owns it', () => {
    const steps = uploadArtifactSteps([
      '      - name: Upload report',
      '        uses: actions/upload-artifact@sha',
      '        with:',
      '          name: playwright-report-firefox',
      '',
      '      - name: Upload other',
      '        uses: actions/upload-artifact@sha',
      '        with:',
      '          name: playwright-report-webkit',
      '          # a comment between keys',
      '          path: playwright-report/',
      '  next-job:',
      '    steps:',
      '      - uses: actions/upload-artifact@sha',
      '        with:',
      '          path: elsewhere/',
      '          name: lighthouse',
    ]);
    expect(steps).toEqual([
      { name: 'playwright-report-firefox', path: undefined },
      { name: 'playwright-report-webkit', path: 'playwright-report/' },
      { name: 'lighthouse', path: 'elsewhere/' },
    ]);
  });
});
