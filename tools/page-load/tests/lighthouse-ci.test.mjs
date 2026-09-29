import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { jobBlock, testWorkflow } from '../../ci-mirror/tests/workflow-job-steps.mjs';
import {
  GATED_METRICS,
  LIGHTHOUSE_TIMEOUT_MS,
  PROFILES,
  REPORTED_METRICS,
  VISITS,
  assessSummary,
  baselineSourceStatus,
  median,
  readBaseline,
  reportFileName,
  resolveOutDir,
  summarizeMeasurements,
  withOneRetry,
} from '../run-lighthouse-ci.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const RUNNER = join(ROOT, 'tools/page-load/run-lighthouse-ci.mjs');
const PAGE_LOAD_JOB = 'page-load-performance';
const WIRED_LINES = [
  'browsers: chromium',
  'npm run test:lighthouse:ci -- --port=4197',
  'path: lighthouse-reports/ci/',
  'if-no-files-found: warn',
];
// The runner imports Playwright and Lighthouse before it reads a flag.
const RUNNER_EXIT_TIMEOUT_MS = 30_000;
const committedBaseline = JSON.parse(
  readFileSync(join(ROOT, 'tools/page-load/baseline.json'), 'utf8')
);

function measurements(value) {
  return Object.keys(PROFILES).flatMap((profile) =>
    VISITS.flatMap((visit) =>
      [0, 1, 2].map((offset, sample) => ({
        profile,
        visit,
        sample,
        fcpMs: value + offset,
        lcpMs: value + 100 + offset,
        tbtMs: value + 200 + offset,
        performanceScore: 90 - offset,
      }))
    )
  );
}

const unwiredLines = (workflow) =>
  WIRED_LINES.filter((line) => !jobBlock(workflow, PAGE_LOAD_JOB).includes(line));

// Every folder these tests judge or fill sits under the system temp folder, and `repository`
// stands in for the checkout, so no refusal that fails to fire can reach a real one.
function scratchRepository() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'lighthouse-out-')));
  onTestFinished(() => rmSync(scratch, { recursive: true, force: true }));
  const repository = join(scratch, 'repository');
  mkdirSync(repository);
  return { scratch, repository };
}

function folderHolding(folder, entries) {
  mkdirSync(folder, { recursive: true });
  for (const entry of entries) writeFileSync(join(folder, entry), '');
  return folder;
}

function baseline(limit) {
  return {
    profiles: Object.fromEntries(
      Object.keys(PROFILES).map((profile) => [
        profile,
        Object.fromEntries(
          VISITS.map((visit) => [visit, { limits: { fcpMs: limit, lcpMs: limit + 100 } }])
        ),
      ])
    ),
  };
}

describe('the Lighthouse CI metric contract', () => {
  it('keeps the skill form factors and both cache states closed', () => {
    expect(PROFILES).toEqual({
      'phone-portrait': { width: 412, height: 915, deviceScaleFactor: 2.625 },
      'tablet-landscape': { width: 1133, height: 744, deviceScaleFactor: 2 },
    });
    expect(VISITS).toEqual(['first', 'repeat']);
  });

  it('gates stable paints and reports noisy scheduler-derived values', () => {
    expect(GATED_METRICS).toEqual(['fcpMs', 'lcpMs']);
    expect(REPORTED_METRICS).toEqual(['tbtMs', 'performanceScore']);
  });

  it('uses the median so one shared-runner outlier cannot fail the gate', () => {
    expect(median([1_000, 1_010, 9_000])).toBe(1_010);
    expect(median([1_000, 1_010, 1_020, 9_000])).toBe(1_015);
  });

  it('summarizes every profile and visit without mixing their samples', () => {
    const summary = summarizeMeasurements(measurements(1_000));

    expect(summary['phone-portrait'].first).toEqual({
      fcpMs: 1_001,
      lcpMs: 1_101,
      tbtMs: 1_201,
      performanceScore: 89,
    });
    expect(Object.keys(summary)).toEqual(Object.keys(PROFILES));
    expect(Object.keys(summary['tablet-landscape'])).toEqual(VISITS);
  });

  it('fails only when a gated median crosses its own committed limit', () => {
    const summary = summarizeMeasurements(measurements(1_000));

    expect(assessSummary(summary, baseline(1_001))).toEqual([]);
    expect(assessSummary(summary, baseline(1_000))).toEqual([
      'phone-portrait first fcpMs: 1001 ms > 1000 ms',
      'phone-portrait first lcpMs: 1101 ms > 1100 ms',
      'phone-portrait repeat fcpMs: 1001 ms > 1000 ms',
      'phone-portrait repeat lcpMs: 1101 ms > 1100 ms',
      'tablet-landscape first fcpMs: 1001 ms > 1000 ms',
      'tablet-landscape first lcpMs: 1101 ms > 1100 ms',
      'tablet-landscape repeat fcpMs: 1001 ms > 1000 ms',
      'tablet-landscape repeat lcpMs: 1101 ms > 1100 ms',
    ]);
  });

  it('keeps the committed baseline complete and pinned to the installed runner', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

    expect(committedBaseline.lighthouseVersion).toBe(packageJson.devDependencies.lighthouse);
    expect(Object.keys(committedBaseline.profiles)).toEqual(Object.keys(PROFILES));
    for (const profile of Object.keys(PROFILES)) {
      expect(Object.keys(committedBaseline.profiles[profile])).toEqual(VISITS);
      for (const visit of VISITS) {
        const entry = committedBaseline.profiles[profile][visit];
        expect(entry.limits.fcpMs).toBeGreaterThan(entry.baseline.fcpMs);
        expect(entry.limits.lcpMs).toBeGreaterThan(entry.baseline.lcpMs);
      }
    }
  });

  it('reports source provenance without invalidating absolute regression limits', () => {
    expect(baselineSourceStatus({ sourceDigest: 'same' }, 'same')).toEqual({
      matches: true,
      baselineDigest: 'same',
      currentDigest: 'same',
    });
    expect(baselineSourceStatus({ sourceDigest: 'old' }, 'changed')).toEqual({
      matches: false,
      baselineDigest: 'old',
      currentDigest: 'changed',
    });
  });

  it('retries one failed Lighthouse invocation without hiding a second failure', () => {
    const attempts = [];
    const recovered = withOneRetry(
      (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) throw new Error('transient');
        return 'report';
      },
      (error) => expect(error.message).toBe('transient')
    );

    expect(recovered).toBe('report');
    expect(attempts).toEqual([1, 2]);
    expect(() =>
      withOneRetry(() => {
        throw new Error('persistent');
      })
    ).toThrow('persistent');
  });

  it('bounds each attempt so a retry still fits the workflow budget', () => {
    expect(LIGHTHOUSE_TIMEOUT_MS).toBe(120_000);
  });

  it('gives the recurring first-visit LCP mode equal headroom on both viewports', () => {
    expect(committedBaseline.profiles['tablet-landscape'].first.limits.lcpMs).toBe(
      committedBaseline.profiles['phone-portrait'].first.limits.lcpMs
    );
  });

  it('keeps the production-build CI job wired to Chromium, an explicit port, and artifacts', () => {
    expect(unwiredLines(testWorkflow)).toEqual([]);
  });

  it.each(WIRED_LINES)('misses "%s" once only another job carries it', (line) => {
    const job = jobBlock(testWorkflow, PAGE_LOAD_JOB);
    const movedToAnotherJob =
      testWorkflow.replace(job, () => job.replace(line, '')) +
      `\n  decoy:\n    steps:\n      - run: echo ${line}\n`;

    expect(movedToAnotherJob).toContain(line);
    expect(unwiredLines(movedToAnotherJob)).toEqual([line]);
  });

  it('reads the baseline an absolute path names', () => {
    const { scratch } = scratchRepository();
    const copy = join(scratch, 'baseline.json');
    copyFileSync(join(ROOT, 'tools/page-load/baseline.json'), copy);

    expect(readBaseline(copy)).toEqual(committedBaseline);
    expect(readBaseline('tools/page-load/baseline.json')).toEqual(committedBaseline);
  });
});

describe('the folder a Lighthouse run replaces', () => {
  it('resolves a relative folder against the repository', () => {
    const { repository } = scratchRepository();

    expect(resolveOutDir('lighthouse-reports/ci', repository)).toBe(
      join(repository, 'lighthouse-reports/ci')
    );
  });

  it('takes an absolute folder inside the repository as given', () => {
    const { repository } = scratchRepository();
    const inside = join(repository, 'reports');

    expect(resolveOutDir(inside, repository)).toBe(inside);
  });

  it.each(['.', './', 'reports/..'])('refuses %j, the repository root', (out) => {
    const { repository } = scratchRepository();

    expect(() => resolveOutDir(out, repository)).toThrow(
      `--out=${out} resolves to ${repository}, the repository root`
    );
  });

  it.each(['..', '../sibling', 'reports/../../sibling'])(
    'refuses %j, outside the repository',
    (out) => {
      const { repository } = scratchRepository();

      expect(() => resolveOutDir(out, repository)).toThrow('outside the repository');
    }
  );

  it('refuses an absolute folder outside the repository instead of nesting it inside', () => {
    const { scratch, repository } = scratchRepository();
    const outside = join(scratch, 'elsewhere');

    expect(() => resolveOutDir(outside, repository)).toThrow(
      `--out=${outside} resolves to ${outside}, outside the repository`
    );
  });

  it('refuses a folder that a symlink carries outside the repository', () => {
    const { scratch, repository } = scratchRepository();
    const outside = folderHolding(join(scratch, 'elsewhere'), []);
    symlinkSync(outside, join(repository, 'linked'));

    expect(() => resolveOutDir('linked/reports', repository)).toThrow(
      `--out=linked/reports resolves to ${join(outside, 'reports')}, outside the repository`
    );
  });

  it('refuses a folder holding entries the runner did not write', () => {
    const { repository } = scratchRepository();
    const occupied = folderHolding(join(repository, 'docs'), ['notes.md', 'summary.json']);

    expect(() => resolveOutDir('docs', repository)).toThrow(
      'which holds entries this runner did not write, such as notes.md'
    );
    expect(readdirSync(occupied)).toEqual(['notes.md', 'summary.json']);
  });

  it('refuses a report name from a profile the runner does not measure', () => {
    const { repository } = scratchRepository();
    folderHolding(join(repository, 'reports'), ['desktop-first-1.report.json']);

    expect(() => resolveOutDir('reports', repository)).toThrow('desktop-first-1.report.json');
  });

  it('refuses a file', () => {
    const { repository } = scratchRepository();
    folderHolding(repository, ['summary.json']);

    expect(() => resolveOutDir('summary.json', repository)).toThrow('which is a file');
  });

  it('accepts an empty folder and one that holds only an earlier run', () => {
    const { repository } = scratchRepository();
    const empty = folderHolding(join(repository, 'empty'), []);
    const earlierRun = folderHolding(join(repository, 'lighthouse-reports/ci'), [
      'summary.json',
      '.DS_Store',
      ...Object.keys(PROFILES).flatMap((profile) =>
        VISITS.map((visit) => reportFileName(profile, visit, 12))
      ),
    ]);
    mkdirSync(join(earlierRun, '.profiles', 'phone-portrait-1'), { recursive: true });

    expect(resolveOutDir('empty', repository)).toBe(empty);
    expect(resolveOutDir('lighthouse-reports/ci', repository)).toBe(earlierRun);
  });

  // The baseline named here does not exist, so a run whose refusal failed to fire stops at
  // reading it, before the step that replaces the folder.
  it(
    'stops the runner before it does any work',
    () => {
      const { scratch } = scratchRepository();
      const held = folderHolding(join(scratch, 'held'), ['notes.md']);

      const result = spawnSync(
        process.execPath,
        [RUNNER, `--out=${held}`, `--baseline=${join(scratch, 'absent.json')}`],
        { cwd: ROOT, encoding: 'utf8', timeout: RUNNER_EXIT_TIMEOUT_MS }
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        `--out=${held} resolves to ${held}, outside the repository: ` +
          'the run replaces this folder, so keep it inside the checkout\n'
      );
      expect(readdirSync(held)).toEqual(['notes.md']);
    },
    RUNNER_EXIT_TIMEOUT_MS
  );
});
