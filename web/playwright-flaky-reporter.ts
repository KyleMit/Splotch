import { appendFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Make a retried pass visible on a green build.
//
// Retries are what let CI run oversubscribed workers cheaply (ADR-0078), and the
// price is that a test which fails 30% of the time still ships a green check.
// Playwright does count flaky tests in its run summary, but that lands in the log
// of a job nobody opens *because* it is green — so the debt accrues with no
// signal, which is how the magic-brush specs reached the state ADR-0080 found
// them in.
//
// This reporter turns each retried pass into a GitHub Actions warning annotation
// (surfaced on the run and the PR's Files view) plus a job-summary table, so the
// number of masked flakes is visible without reading logs. It never changes the
// run's outcome: a retried pass is still a pass, and deciding otherwise is what
// `retries: 0` is for.

export type FlakyPass = { title: string; attempts: number };

const ANNOTATION_TITLE = 'Flaky test';

function describe({ title, attempts }: FlakyPass): string {
  return `${title} — passed on attempt ${attempts} (${attempts - 1} earlier ${
    attempts === 2 ? 'attempt' : 'attempts'
  } failed)`;
}

/**
 * Workflow-command lines GitHub renders as annotations. A `%`, newline or
 * carriage return in the message would break the command's parsing, so each is
 * escaped the way GitHub's own toolkit does.
 */
export function flakyAnnotations(passes: readonly FlakyPass[]): string[] {
  return passes.map(
    (pass) =>
      `::warning title=${ANNOTATION_TITLE}::${describe(pass)
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A')}`
  );
}

/** The same list as a Markdown section for $GITHUB_STEP_SUMMARY. */
export function flakySummary(passes: readonly FlakyPass[]): string {
  const rows = passes.map((pass) => `| ${pass.title} | ${pass.attempts} |`).join('\n');
  return [
    `### ${passes.length} flaky ${passes.length === 1 ? 'test' : 'tests'} (passed on retry)`,
    '',
    'Green because retries absorbed these, not because they are reliable.',
    '',
    '| Test | Attempts |',
    '| --- | --- |',
    rows,
    '',
  ].join('\n');
}

export default class FlakyPassReporter implements Reporter {
  private readonly flaky: FlakyPass[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed' && result.retry > 0) {
      this.flaky.push({
        title: test.titlePath().filter(Boolean).join(' › '),
        attempts: result.retry + 1,
      });
    }
  }

  onEnd() {
    if (this.flaky.length === 0) return;
    for (const line of flakyAnnotations(this.flaky)) console.log(line);
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) appendFileSync(summaryPath, flakySummary(this.flaky));
  }

  printsToStdio() {
    return true;
  }
}
