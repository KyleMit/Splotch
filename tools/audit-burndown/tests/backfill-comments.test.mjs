// Drives tools/audit-burndown/backfill-comments.mjs through runBackfill inside a
// throwaway git repository that is also the working directory, so the store, the
// posted log, run.log, and the role envelopes all resolve inside it and this
// checkout's own .audit-work/ (a live run's state) is never touched. One case
// spawns the CLI to cover its isMain wiring, on a `done` path that exits before
// any write.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBackfill } from '../backfill-comments.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'backfill-comments.mjs');
const DEFAULT_STORE = '.audit-work/pending-comments.jsonl';
const POSTED_LOG = '.audit-work/posted-comments.log';
const LOGS = '.audit-work/logs';
const RUN_LOG = `${LOGS}/run.log`;
// A backlog other than docs/AUDIT.md, as a run started with AUDIT_FILE has.
const CUSTOM_BACKLOG = 'docs/AUDIT-SMELLS.md';

// The fixture's own git calls ignore the host's config, so a global signing key
// or hook cannot change the history the tests build.
const FIXTURE_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

const FIRST_TITLE = '[P1][complexity] First finding';
const SECOND_TITLE = '[P2][dead-code] Second finding';
const entry = (title, problem) =>
  `### ${title}\n\n#### Problem\n\n${problem}\n\n#### Fix\n\nDo the thing.\n`;
const FIRST_ENTRY = entry(FIRST_TITLE, 'The first thing is wrong.');
const SECOND_ENTRY = entry(SECOND_TITLE, 'The second thing is wrong.');
const BACKLOG = ['# Audit', '', '## Source: Code audit', '', FIRST_ENTRY, SECOND_ENTRY].join('\n');

const record = (sha) => ({ sha, title: 't', problem: 'p', fix: 'f' });
const storeLine = (r) => `${JSON.stringify(r)}\n`;
const envelope = (structured) => JSON.stringify({ structured_output: structured, session_id: 's' });

let originalCwd;
let repo;

const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    env: FIXTURE_GIT_ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function commit(path, content, message) {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), content);
  git('add', path);
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

// The two lines the driver writes to run.log for one accepted fix.
function logAcceptedFix(iter, title, sha) {
  mkdirSync(LOGS, { recursive: true });
  appendFileSync(
    RUN_LOG,
    `[10:00:00] ${iter}  (1 remaining)  ${title}\n[10:05:00]   DONE  ${sha.slice(0, 12)}\n`
  );
}

// A verified finding the implementer fixed, the reviewer sent back once, and the
// second round approved: the record takes the fix round's summary and the
// first review's objection.
function writeEnvelopes(iter) {
  const write = (role, structured) =>
    writeFileSync(join(LOGS, `${iter}.${role}.json`), envelope(structured));
  write('verify', { verdict: 'VALID', e2e_specs: ['tests/first.spec.ts'] });
  write('impl', { summary: 'Split the first thing.' });
  write('review1', { status: 'CHANGES_REQUIRED', findings: ['A caller still used the old path.'] });
  write('fix1', { summary: 'Moved the last caller too.' });
  write('review2', { status: 'APPROVED', findings: ['Reads well.'] });
}

// A base commit staging two findings in `backlog`, then the fix for the first,
// which deletes its entry the way the driver's close-out does.
function acceptedFix(backlog) {
  const base = commit(backlog, BACKLOG, 'stage findings');
  const fix = commit(
    backlog,
    BACKLOG.replace(FIRST_ENTRY, ''),
    `fix(audit): First finding\n\nAudit: ${FIRST_TITLE}`
  );
  logAcceptedFix('iter0001', FIRST_TITLE, fix);
  writeEnvelopes('iter0001');
  return { base, fix };
}

const readStore = (path = DEFAULT_STORE) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

// What runBackfill printed, one string per console call.
const printed = (stream) => console[stream].mock.calls.map((args) => args.join(' '));

beforeEach(() => {
  originalCwd = process.cwd();
  repo = mkdtempSync(join(tmpdir(), 'backfill-comments-'));
  git('init', '-q', '-b', 'main');
  process.chdir(repo);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  rmSync(repo, { recursive: true, force: true });
});

describe('importing the script', () => {
  it('starts nothing', async () => {
    const before = process.cwd();

    await import('../backfill-comments.mjs?fresh');

    // A script that ran its CLI on import would have chdir'd to the repo root
    // and dispatched on the test runner's own argv.
    expect(process.cwd()).toBe(before);
    expect(printed('log')).toEqual([]);
    expect(printed('error')).toEqual([]);
  });
});

describe('done <sha>', () => {
  it('removes exactly the named record and appends its sha to the posted log', () => {
    const [first, posted, last] = ['a', 'b', 'c'].map((c) => record(c.repeat(40)));
    mkdirSync('.audit-work');
    writeFileSync(DEFAULT_STORE, [first, posted, last].map(storeLine).join(''));

    expect(runBackfill(['done', 'bbbbbbbbbbbb'], {})).toBe(0);

    expect(readFileSync(DEFAULT_STORE, 'utf8')).toBe(storeLine(first) + storeLine(last));
    expect(readFileSync(POSTED_LOG, 'utf8')).toBe(`${posted.sha}\n`);
    expect(readFileSync(RUN_LOG, 'utf8')).toMatch(
      /^\[\d\d:\d\d:\d\d\] {3}posted per-commit comment for bbbbbbbbbbbb\n$/
    );
    expect(printed('log')).toEqual([`dropped bbbbbbbbbbbb — 2 still pending in ${DEFAULT_STORE}`]);
  });

  it('drains a committed store from a checkout that has no .audit-work yet', () => {
    const store = 'docs/AUDIT-PENDING-COMMENTS.jsonl';
    const pending = record('a'.repeat(40));
    mkdirSync('docs');
    writeFileSync(store, storeLine(pending));

    expect(runBackfill(['done', 'aaaaaaa'], { COMMENT_STORE: store })).toBe(0);

    expect(readFileSync(store, 'utf8')).toBe('');
    expect(readFileSync(POSTED_LOG, 'utf8')).toBe(`${pending.sha}\n`);
  });

  it('drops every record of a commit that was captured twice', () => {
    const sha = 'a'.repeat(40);
    const other = record('b'.repeat(40));
    mkdirSync('.audit-work');
    writeFileSync(
      DEFAULT_STORE,
      [record(sha), { ...record(sha), fix: ['f'] }, other].map(storeLine).join('')
    );

    expect(runBackfill(['done', sha], {})).toBe(0);

    expect(readFileSync(DEFAULT_STORE, 'utf8')).toBe(storeLine(other));
    expect(readFileSync(POSTED_LOG, 'utf8')).toBe(`${sha}\n`);
  });

  // Spawned for real: the CLI chdirs to this checkout's root, and the
  // ambiguous-prefix refusal exits before the store, the posted log, or run.log
  // could be written.
  it('refuses an ambiguous prefix through the CLI, leaving the store untouched', () => {
    const store = join(repo, 'pending-comments.jsonl');
    const contents = ['aaaaaaa1111', 'aaaaaaa2222']
      .map((prefix) => storeLine(record(prefix.padEnd(40, '0'))))
      .join('');
    writeFileSync(store, contents);

    const result = spawnSync('node', [SCRIPT, 'done', 'aaaaaaa'], {
      env: { ...process.env, COMMENT_STORE: store },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ambiguous prefix aaaaaaa matches 2 pending records');
    expect(readFileSync(store, 'utf8')).toBe(contents);
  });
});

describe('capture', () => {
  it("rebuilds a fix's record from run.log, its envelopes, and the run's own backlog", () => {
    const { base, fix } = acceptedFix(CUSTOM_BACKLOG);

    expect(runBackfill(['capture', `${base}..HEAD`], { AUDIT_FILE: CUSTOM_BACKLOG })).toBe(0);

    expect(readStore()).toEqual([
      {
        sha: fix,
        title: FIRST_TITLE,
        problem: 'The first thing is wrong.',
        fix: 'Moved the last caller too.',
        catches: ['A caller still used the old path.'],
        e2eSpecs: ['tests/first.spec.ts'],
      },
    ]);
  });

  it('fails on a range git cannot resolve, naming it, and leaves the store untouched', () => {
    acceptedFix(CUSTOM_BACKLOG);
    const pending = storeLine(record('d'.repeat(40)));
    writeFileSync(DEFAULT_STORE, pending);

    expect(runBackfill(['capture', 'no-such..HEAD'], { AUDIT_FILE: CUSTOM_BACKLOG })).toBe(1);

    expect(readFileSync(DEFAULT_STORE, 'utf8')).toBe(pending);
    expect(printed('log')).toEqual([]);
    const errors = printed('error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('cannot resolve range no-such..HEAD');
    expect(errors[0]).toContain("bad revision 'no-such..HEAD'");
    expect(errors[0]).toContain('origin/main..HEAD');
  });

  it('fails on the default range in a checkout with no local main', () => {
    commit('README.md', 'readme\n', 'first');
    git('branch', '-m', 'main', 'work');

    expect(runBackfill(['capture'], {})).toBe(1);

    expect(printed('error')[0]).toContain('cannot resolve range main..HEAD');
    expect(existsSync(DEFAULT_STORE)).toBe(false);
  });

  it('appends, so a record the driver adds while it runs survives', () => {
    const { base, fix } = acceptedFix(CUSTOM_BACKLOG);
    const earlier = record('e'.repeat(40));
    const driverRecord = record('f'.repeat(40));
    writeFileSync(DEFAULT_STORE, storeLine(earlier));
    // The driver's close-out appends whenever a fix lands. Land one mid-capture,
    // at the line capture prints for each record it builds.
    console.log.mockImplementation((message) => {
      if (String(message).startsWith('captured ')) {
        appendFileSync(DEFAULT_STORE, storeLine(driverRecord));
      }
    });

    expect(runBackfill(['capture', `${base}..HEAD`], { AUDIT_FILE: CUSTOM_BACKLOG })).toBe(0);

    expect(readStore().map((r) => r.sha)).toEqual([earlier.sha, fix, driverRecord.sha]);
  });

  it('counts only the posted commits inside the range as skipped', () => {
    commit(CUSTOM_BACKLOG, BACKLOG, 'stage findings');
    const firstFix = commit(CUSTOM_BACKLOG, BACKLOG.replace(FIRST_ENTRY, ''), 'fix first');
    const secondFix = commit(
      CUSTOM_BACKLOG,
      BACKLOG.replace(FIRST_ENTRY, '').replace(SECOND_ENTRY, ''),
      'fix second'
    );
    // Two runs in one run.log, every comment posted; the range holds the second.
    logAcceptedFix('iter0001', FIRST_TITLE, firstFix);
    logAcceptedFix('iter0001', SECOND_TITLE, secondFix);
    writeFileSync(POSTED_LOG, `${firstFix}\n${secondFix}\n`);

    expect(runBackfill(['capture', `${firstFix}..HEAD`], { AUDIT_FILE: CUSTOM_BACKLOG })).toBe(0);

    expect(printed('log')).toEqual([
      'skipped 1 already posted',
      `\n0 captured, 0 total in ${DEFAULT_STORE}`,
    ]);
  });
});
