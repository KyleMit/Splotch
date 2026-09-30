import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { playwrightReportFolder } from '../../web/playwright.shared.ts';
import { jobBlocks, stepBlocks, testWorkflow } from '../ci-mirror/tests/workflow-job-steps.mjs';

// playwright.shared.ts pins the folder both Playwright reporters write to, and
// test.yml uploads it by a literal path YAML cannot import. This is the guard
// against the two drifting apart: a moved folder would leave every Playwright
// job uploading nothing (if-no-files-found: error) — or, worse, an old copy.

const repoRoot = join(import.meta.dirname, '..', '..');
const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n');

/**
 * Every upload-artifact step as its own `{ name, path }`, each read only from
 * that step's `with:` block — never borrowed from a neighbouring step or job.
 */
function uploadArtifactSteps(workflow) {
  return jobBlocks(workflow)
    .flatMap(({ text }) => stepBlocks(text))
    .filter(({ text }) => /^ {6}(?:- | {2})uses: actions\/upload-artifact/m.test(text))
    .map(({ text }) => ({
      name: text.match(/^ {10}name: (\S.*)$/m)?.[1],
      path: text.match(/^ {10}path: (\S+)$/m)?.[1],
    }));
}

describe('Playwright report folder', () => {
  const folder = relative(repoRoot, playwrightReportFolder);
  const reportUploads = uploadArtifactSteps(testWorkflow).filter(({ name }) =>
    name?.startsWith('playwright-report-')
  );

  // Pinned by name, not counted: a step whose name fails to parse drops out of the filter, and
  // the steps that remain keep any count above zero.
  it('is what every Playwright job in test.yml uploads', () => {
    expect(reportUploads.map(({ name }) => name).sort()).toEqual([
      'playwright-report-firefox',
      'playwright-report-shard-${{ matrix.shard }}',
      'playwright-report-webkit',
    ]);
    for (const { name, path } of reportUploads)
      expect({ name, path }).toEqual({ name, path: `${folder}/` });
  });

  it('is gitignored, so the per-run record never churns the working tree', () => {
    expect(gitignore).toContain(`/${folder}/`);
  });
});

describe('upload-artifact step parsing', () => {
  // A lookup that ran past a step's own `with:` block paired one artifact name
  // with the next step's path and still satisfied the assertion above. The
  // step's own display name is not an artifact name either.
  it('reads a path only from the step that owns it', () => {
    const steps = uploadArtifactSteps(
      [
        'jobs:',
        '  report:',
        '    steps:',
        '      - name: Upload report',
        '        uses: actions/upload-artifact@sha',
        '        with:',
        '          name: playwright-report-firefox',
        '',
        '      - name: Upload shard',
        '        uses: actions/upload-artifact@sha',
        '        with:',
        '          name: playwright-report-shard-${{ matrix.shard }}',
        '          path: playwright-report/',
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
        '        name: Upload the Lighthouse report',
        '        with:',
        '          path: elsewhere/',
        '          name: lighthouse',
      ].join('\n')
    );
    expect(steps).toEqual([
      { name: 'playwright-report-firefox', path: undefined },
      { name: 'playwright-report-shard-${{ matrix.shard }}', path: 'playwright-report/' },
      { name: 'playwright-report-webkit', path: 'playwright-report/' },
      { name: 'lighthouse', path: 'elsewhere/' },
    ]);
  });
});
