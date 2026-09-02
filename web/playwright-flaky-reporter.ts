import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStatus,
} from '@playwright/test/reporter';

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
// number of masked flakes is visible without reading logs. Neither can be
// searched across runs, so it also writes every run — clean or not — as a
// flaky.json record into the uploaded report artifact, which is what lets a
// digest sum masked flakes over a week of jobs instead of scraping their logs.
// It never changes the run's outcome: a retried pass is still a pass, and
// deciding otherwise is what `retries: 0` is for.

export type FlakyPass = { title: string; attempts: number; project: string; file: string };

/** The GitHub Actions run a record came from; null outside of Actions. */
export type RunIdentity = {
  id: string;
  attempt: number;
  sha: string;
  branch: string;
  event: string;
};

export type FlakyRecord = {
  schemaVersion: typeof FLAKY_RECORD_SCHEMA_VERSION;
  run: RunIdentity | null;
  shard: FullConfig['shard'];
  // Playwright's verdict on the whole run. A digest keeps `passed` and `failed`
  // and drops the rest: an interrupted or timed-out run (SIGINT, globalTimeout)
  // still reaches onExit and still gets uploaded, and without this it would read
  // as a small clean sample.
  status: FullResult['status'];
  tests: number;
  flaky: FlakyPass[];
};

export type FlakyReporterOptions = { outputFolder: string };

export const FLAKY_RECORD_FILENAME = 'flaky.json';

// Bumped when a field changes meaning or goes away — adding one is compatible.
// A digest reads records retained from earlier commits, and this is how it
// tells one it understands from one it would misread.
export const FLAKY_RECORD_SCHEMA_VERSION = 1;

// First attempts that never executed, so they are not part of the denominator.
const UNRUN_STATUSES: ReadonlySet<TestStatus> = new Set(['skipped', 'interrupted']);

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

/**
 * On a pull_request event GITHUB_REF_NAME is the synthetic `<n>/merge` ref;
 * the branch under test is GITHUB_HEAD_REF, which push events leave unset.
 */
export function runIdentity(env: NodeJS.ProcessEnv): RunIdentity | null {
  const id = env.GITHUB_RUN_ID;
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  const sha = env.GITHUB_SHA;
  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  const event = env.GITHUB_EVENT_NAME;
  if (!id || !Number.isInteger(attempt) || !sha || !branch || !event) return null;
  return { id, attempt, sha, branch, event };
}

export function flakyRecord(
  passes: readonly FlakyPass[],
  context: Pick<FlakyRecord, 'run' | 'shard' | 'status' | 'tests'>
): FlakyRecord {
  return { schemaVersion: FLAKY_RECORD_SCHEMA_VERSION, ...context, flaky: [...passes] };
}

function projectName(test: TestCase): string {
  const project = test.parent.project();
  if (!project) throw new Error(`"${test.title}" belongs to no Playwright project`);
  return project.name;
}

export default class FlakyPassReporter implements Reporter {
  private readonly outputFolder: string;
  private readonly flaky: FlakyPass[] = [];
  private tests = 0;
  private config: Pick<FullConfig, 'rootDir' | 'shard'> | undefined;
  private status: FullResult['status'] | undefined;

  // Playwright hands a reporter whatever object the config listed beside it,
  // unvalidated, so the one required option is checked here: a run whose
  // record went nowhere would read as a clean job to a digest.
  constructor(options: Partial<FlakyReporterOptions>) {
    if (!options.outputFolder) {
      throw new Error('playwright-flaky-reporter needs an outputFolder for its flaky.json');
    }
    this.outputFolder = options.outputFolder;
  }

  onBegin(config: FullConfig) {
    this.config = { rootDir: config.rootDir, shard: config.shard };
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.retry === 0 && !UNRUN_STATUSES.has(result.status)) this.tests += 1;
    if (result.status === 'passed' && result.retry > 0) {
      this.flaky.push({
        title: test.titlePath().filter(Boolean).join(' › '),
        attempts: result.retry + 1,
        project: projectName(test),
        file: relative(this.begun.rootDir, test.location.file),
      });
    }
  }

  onEnd(result: FullResult) {
    this.status = result.status;
    if (this.flaky.length === 0) return;
    for (const line of flakyAnnotations(this.flaky)) console.log(line);
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) appendFileSync(summaryPath, flakySummary(this.flaky));
  }

  // The record shares its folder with the HTML report, and the HTML reporter
  // empties that folder in its own onEnd. onExit runs only after every reporter
  // has finished onEnd, so the record survives whatever order the config lists
  // the reporters in.
  async onExit() {
    if (!this.status) throw new Error('FlakyPassReporter was exited before onEnd');
    const record = flakyRecord(this.flaky, {
      run: runIdentity(process.env),
      shard: this.begun.shard,
      status: this.status,
      tests: this.tests,
    });
    mkdirSync(this.outputFolder, { recursive: true });
    writeFileSync(
      join(this.outputFolder, FLAKY_RECORD_FILENAME),
      `${JSON.stringify(record, null, 2)}\n`
    );
  }

  printsToStdio() {
    return true;
  }

  private get begun(): Pick<FullConfig, 'rootDir' | 'shard'> {
    if (!this.config) throw new Error('FlakyPassReporter was used before onBegin');
    return this.config;
  }
}
