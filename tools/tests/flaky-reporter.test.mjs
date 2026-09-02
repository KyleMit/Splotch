import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import FlakyPassReporter, {
  FLAKY_RECORD_FILENAME,
  FLAKY_RECORD_SCHEMA_VERSION,
  flakyAnnotations,
  flakySummary,
  runIdentity,
} from '../../web/playwright-flaky-reporter.ts';

// The reporter that makes a retried pass visible on a green build (ADR-0078's
// "retries hide the problem they compensate for"). All three outputs are
// strings another system parses — GitHub's workflow-command grammar, its
// Markdown summary, and the flaky.json record a digest sums across runs — so
// they are checked here rather than eyeballed in a CI log.

const ROOT_DIR = '/repo/web/tests';

/** Minimal stand-ins for the two Playwright objects onTestEnd is handed. */
const testCase = (project, file, ...titles) => ({
  title: titles.at(-1) ?? file,
  titlePath: () => ['', project, file, ...titles],
  parent: { project: () => ({ name: project }) },
  location: { file: join(ROOT_DIR, file), line: 1, column: 1 },
});
const attempt = (retry, status = 'passed') => ({ retry, status });

const tempDir = (prefix) => mkdtempSync(join(tmpdir(), prefix));

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

describe('run identity', () => {
  const actionsEnv = {
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SHA: 'abc',
    GITHUB_REF_NAME: '77/merge',
    GITHUB_EVENT_NAME: 'pull_request',
  };

  // On a pull_request event GITHUB_REF_NAME is the synthetic merge ref, so a
  // record keyed on it could never tell a flake on main from one on a branch
  // rewriting the very code that flaked.
  it('names the head branch on a pull request', () => {
    expect(runIdentity({ ...actionsEnv, GITHUB_HEAD_REF: 'feat/thing' })).toEqual({
      id: '123',
      attempt: 2,
      sha: 'abc',
      branch: 'feat/thing',
      event: 'pull_request',
    });
  });

  it('falls back to the ref name on a push, where the head ref is unset', () => {
    const push = { ...actionsEnv, GITHUB_HEAD_REF: '', GITHUB_EVENT_NAME: 'push' };
    expect(runIdentity(push)).toMatchObject({ branch: '77/merge', event: 'push' });
  });

  it('is null outside GitHub Actions', () => {
    expect(runIdentity({})).toBeNull();
    expect(runIdentity({ ...actionsEnv, GITHUB_RUN_ATTEMPT: undefined })).toBeNull();
  });
});

describe('FlakyPassReporter', () => {
  /**
   * Run a reporter through its whole lifecycle and return the lines it logged
   * plus the folder its record landed in.
   *
   * GITHUB_STEP_SUMMARY is unset for the duration, not just captured: every step
   * on GitHub Actions has it set, and .github/workflows/test.yml runs
   * `npm run test:tools` — so without this the fixtures below append a
   * fabricated flaky-test table, naming a real spec, to the Tests job summary of
   * every CI run. That would be a permanent false positive on the one signal this
   * reporter exists to provide.
   *
   * The record has the same hazard in a worse form — a fixture writing the real
   * playwright-report/flaky.json would be uploaded and summed as genuine flake
   * data — which is why the folder is always a fresh temp dir here, and why the
   * reporter refuses to construct without one. The GITHUB_* identity variables
   * are pinned for the same reason the summary is unset: so the record's `run`
   * is the fixture's, whether or not this test itself runs on Actions.
   */
  async function run(results, { summaryPath, shard = null, env = {} } = {}) {
    const outputFolder = tempDir('flaky-record-');
    const reporter = new FlakyPassReporter({ outputFolder });
    const lines = [];
    const log = console.log;
    const overrides = {
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_RUN_ID: undefined,
      GITHUB_RUN_ATTEMPT: undefined,
      GITHUB_SHA: undefined,
      GITHUB_HEAD_REF: undefined,
      GITHUB_REF_NAME: undefined,
      GITHUB_EVENT_NAME: undefined,
      ...env,
    };
    const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    const apply = (values) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
    apply(overrides);
    console.log = (line) => lines.push(line);
    try {
      reporter.onBegin({ rootDir: ROOT_DIR, shard });
      for (const [test, result] of results) reporter.onTestEnd(test, result);
      reporter.onEnd();
      await reporter.onExit();
    } finally {
      console.log = log;
      apply(saved);
    }
    return { lines, outputFolder };
  }

  const collect = async (results, options) => (await run(results, options)).lines;
  const record = async (results, options) => {
    const { outputFolder } = await run(results, options);
    return JSON.parse(readFileSync(join(outputFolder, FLAKY_RECORD_FILENAME), 'utf8'));
  };

  it('reports a pass that needed a retry', async () => {
    const lines = await collect([
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
  it('appends the summary when GitHub gives it somewhere to write', async () => {
    const summaryPath = join(tempDir('flaky-'), 'summary.md');
    writeFileSync(summaryPath, '# existing\n');
    await collect([[testCase('chromium', 'flaky'), attempt(1)]], { summaryPath });
    const written = readFileSync(summaryPath, 'utf8');
    expect(written).toContain('# existing');
    expect(written).toContain('### 1 flaky test (passed on retry)');
  });

  it('writes no summary when a clean run has nothing to report', async () => {
    const summaryPath = join(tempDir('flaky-'), 'summary.md');
    writeFileSync(summaryPath, '');
    await collect([[testCase('chromium', 'clean'), attempt(0)]], { summaryPath });
    expect(readFileSync(summaryPath, 'utf8')).toBe('');
  });

  // A first-attempt pass is the whole suite on a good day, and a test that
  // failed every attempt is already a red build reported by the other reporters.
  it('ignores a clean pass and a genuine failure', async () => {
    expect(
      await collect([
        [testCase('chromium', 'clean'), attempt(0)],
        [testCase('chromium', 'broken'), attempt(0, 'failed')],
        [testCase('chromium', 'broken'), attempt(1, 'failed')],
        [testCase('chromium', 'broken'), attempt(2, 'timedOut')],
      ])
    ).toEqual([]);
  });

  // A digest that only ever sees flaky runs cannot compute a rate, and cannot
  // tell a clean shard from one whose reporter never ran.
  it('records a clean run as an empty record, not no record', async () => {
    expect(await record([[testCase('chromium', 'clean'), attempt(0)]])).toEqual({
      schemaVersion: FLAKY_RECORD_SCHEMA_VERSION,
      run: null,
      shard: null,
      tests: 1,
      flaky: [],
    });
  });

  it('carries the project and spec file structurally, not just in the title', async () => {
    const { flaky } = await record([
      [testCase('webkit', 'engine-smoke.spec.ts', 'boot', 'draws'), attempt(0, 'failed')],
      [testCase('webkit', 'engine-smoke.spec.ts', 'boot', 'draws'), attempt(1)],
    ]);
    expect(flaky).toEqual([
      {
        title: 'webkit › engine-smoke.spec.ts › boot › draws',
        attempts: 2,
        project: 'webkit',
        file: 'engine-smoke.spec.ts',
      },
    ]);
  });

  it('counts each test once, on its first attempt, skipping the skipped', async () => {
    const { tests } = await record([
      [testCase('chromium', 'a'), attempt(0)],
      [testCase('chromium', 'b'), attempt(0, 'failed')],
      [testCase('chromium', 'b'), attempt(1)],
      [testCase('chromium', 'c'), attempt(0, 'skipped')],
    ]);
    expect(tests).toBe(2);
  });

  it('stamps the run identity and the shard the record came from', async () => {
    const written = await record([[testCase('chromium', 'clean'), attempt(0)]], {
      shard: { current: 3, total: 8 },
      env: {
        GITHUB_RUN_ID: '9',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: 'f8edfa3',
        GITHUB_HEAD_REF: 'feat/flaky-json',
        GITHUB_REF_NAME: '1/merge',
        GITHUB_EVENT_NAME: 'pull_request',
      },
    });
    expect(written.shard).toEqual({ current: 3, total: 8 });
    expect(written.run).toEqual({
      id: '9',
      attempt: 1,
      sha: 'f8edfa3',
      branch: 'feat/flaky-json',
      event: 'pull_request',
    });
  });

  // The HTML reporter empties the shared folder during its onEnd; a record
  // written any earlier would be deleted with it. onExit is the hook Playwright
  // runs only once every reporter's onEnd has completed.
  it('writes the record from onExit, after every onEnd', async () => {
    const outputFolder = tempDir('flaky-record-');
    const reporter = new FlakyPassReporter({ outputFolder });
    reporter.onBegin({ rootDir: ROOT_DIR, shard: null });
    reporter.onEnd();
    const recordPath = join(outputFolder, FLAKY_RECORD_FILENAME);
    expect(existsSync(recordPath)).toBe(false);
    await reporter.onExit();
    expect(existsSync(recordPath)).toBe(true);
  });

  // The only way a fixture could write the real artifact is by defaulting to
  // it, so there is no default.
  it('refuses to construct without a folder for its record', () => {
    expect(() => new FlakyPassReporter({})).toThrow(/outputFolder/);
  });
});
