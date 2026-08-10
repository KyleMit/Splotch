import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import FlakyPassReporter, {
  flakyAnnotations,
  flakySummary,
} from '../../web/playwright-flaky-reporter.ts';

// The reporter that makes a retried pass visible on a green build (ADR-0078's
// "retries hide the problem they compensate for"). Both outputs are strings
// another system parses — GitHub's workflow-command grammar and its Markdown
// summary — so they are checked here rather than eyeballed in a CI log.

/** Minimal stand-ins for the two Playwright objects onTestEnd is handed. */
const testCase = (...titlePath) => ({ titlePath: () => titlePath });
const attempt = (retry, status = 'passed') => ({ retry, status });

describe('flaky annotations', () => {
  it('names the attempt a test passed on', () => {
    expect(flakyAnnotations([{ title: 'admin signs in', attempts: 2 }])).toEqual([
      '::warning title=Flaky test::admin signs in — passed on attempt 2 (1 earlier attempt failed)',
    ]);
  });

  it('pluralizes the earlier attempts', () => {
    expect(flakyAnnotations([{ title: 'reveal', attempts: 3 }])[0]).toContain(
      '(2 earlier attempts failed)'
    );
  });

  // A raw %, CR or LF ends or corrupts a workflow command, so a test title
  // carrying one would silently drop the annotation instead of reporting it.
  it('escapes what would break the workflow command', () => {
    const [line] = flakyAnnotations([{ title: 'a 50% b\nc\rd', attempts: 2 }]);
    expect(line).toContain('a 50%25 b%0Ac%0Dd');
    expect(line.split('\n')).toHaveLength(1);
  });

  it('says nothing when nothing was retried', () => {
    expect(flakyAnnotations([])).toEqual([]);
  });
});

describe('flaky job summary', () => {
  it('renders one Markdown row per flaky test', () => {
    const summary = flakySummary([
      { title: 'one', attempts: 2 },
      { title: 'two', attempts: 3 },
    ]);
    expect(summary).toContain('### 2 flaky tests (passed on retry)');
    expect(summary).toContain('| one | 2 |');
    expect(summary).toContain('| two | 3 |');
  });

  it('keeps the heading singular for one test', () => {
    expect(flakySummary([{ title: 'one', attempts: 2 }])).toContain('### 1 flaky test');
  });
});

describe('FlakyPassReporter', () => {
  /**
   * Run a reporter to completion and return the lines it logged.
   *
   * GITHUB_STEP_SUMMARY is unset for the duration, not just captured: every step
   * on GitHub Actions has it set, and .github/workflows/test.yml runs
   * `npm run test:tools` — so without this the fixtures below append a
   * fabricated flaky-test table, naming a real spec, to the Tests job summary of
   * every CI run. That would be a permanent false positive on the one signal this
   * reporter exists to provide.
   */
  function collect(results, { summaryPath } = {}) {
    const reporter = new FlakyPassReporter();
    for (const [test, result] of results) reporter.onTestEnd(test, result);
    const lines = [];
    const log = console.log;
    const realSummary = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) process.env.GITHUB_STEP_SUMMARY = summaryPath;
    else delete process.env.GITHUB_STEP_SUMMARY;
    console.log = (line) => lines.push(line);
    try {
      reporter.onEnd();
    } finally {
      console.log = log;
      if (realSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = realSummary;
    }
    return lines;
  }

  it('reports a pass that needed a retry', () => {
    const lines = collect([
      [testCase('chromium', 'admin.spec.ts', 'signs in'), attempt(0, 'failed')],
      [testCase('chromium', 'admin.spec.ts', 'signs in'), attempt(1)],
    ]);
    expect(lines).toEqual([
      '::warning title=Flaky test::chromium › admin.spec.ts › signs in — passed on attempt 2 ' +
        '(1 earlier attempt failed)',
    ]);
  });

  // The branch that made the pollution above possible, now covered rather than
  // merely avoided: with the env set, the summary is appended to.
  it('appends the summary when GitHub gives it somewhere to write', () => {
    const summaryPath = join(mkdtempSync(join(tmpdir(), 'flaky-')), 'summary.md');
    writeFileSync(summaryPath, '# existing\n');
    collect([[testCase('chromium', 'flaky'), attempt(1)]], { summaryPath });
    const written = readFileSync(summaryPath, 'utf8');
    expect(written).toContain('# existing');
    expect(written).toContain('### 1 flaky test (passed on retry)');
  });

  it('writes no summary when a clean run has nothing to report', () => {
    const summaryPath = join(mkdtempSync(join(tmpdir(), 'flaky-')), 'summary.md');
    writeFileSync(summaryPath, '');
    collect([[testCase('chromium', 'clean'), attempt(0)]], { summaryPath });
    expect(readFileSync(summaryPath, 'utf8')).toBe('');
  });

  // A first-attempt pass is the whole suite on a good day, and a test that
  // failed every attempt is already a red build reported by the other reporters.
  it('ignores a clean pass and a genuine failure', () => {
    expect(
      collect([
        [testCase('chromium', 'clean'), attempt(0)],
        [testCase('chromium', 'broken'), attempt(0, 'failed')],
        [testCase('chromium', 'broken'), attempt(1, 'failed')],
        [testCase('chromium', 'broken'), attempt(2, 'timedOut')],
      ])
    ).toEqual([]);
  });
});
