import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isRetryableResumeFailure,
  ledgerKeyFor,
  logPathForAttempt,
  parseLaunchArgs,
  PR_HEAD_POLL_INTERVAL_MS,
  PR_HEAD_SETTLE_TIMEOUT_MS,
  readRemoteBranchHead,
  readSettledPullRequest,
  rivalEnvironment,
} from '../launch.mjs';
import { STREAM_FAILURE } from '../stream.mjs';

describe('shared launch arguments', () => {
  it('reviews against main by default and accepts one scope at a time', () => {
    expect(parseLaunchArgs([])).toMatchObject({ scope: { kind: 'base', base: 'main' } });
    expect(parseLaunchArgs(['--pr', '7'])).toMatchObject({ scope: { kind: 'pr', number: 7 } });
    expect(parseLaunchArgs(['--uncommitted'])).toMatchObject({ scope: { kind: 'uncommitted' } });
    expect(parseLaunchArgs(['--commit', 'abc'])).toMatchObject({
      scope: { kind: 'commit', commit: 'abc' },
    });
    expect(() => parseLaunchArgs(['--uncommitted', '--base', 'main'])).toThrow(
      /mutually exclusive/
    );
    expect(() => parseLaunchArgs(['--pr', 'seven'])).toThrow(/--pr/);
    expect(() => parseLaunchArgs(['--effort', 'max'])).toThrow(/effort/);
    expect(() => parseLaunchArgs(['extra'])).toThrow(/positional/);
  });

  // The flag that once selected a read-only pairing was collapsed after the seeded-defect bench;
  // an old launch line must fail loudly rather than run in a mode that no longer exists.
  it('refuses the retired --sandbox flag', () => {
    expect(() => parseLaunchArgs(['--sandbox', 'read-only'])).toThrow(/sandbox/);
  });

  // Measured on the first sandboxed round's review: a workspace-write rival created a request file
  // in a sibling session, because the sandbox's writable temp root is the spool root.
  it('gives the rival a private TMPDIR and dprint cache inside its session', () => {
    const env = { PATH: '/usr/bin', TMPDIR: '/var/folders/x/T' };
    expect(rivalEnvironment(env, { session: '/s' })).toEqual({
      PATH: '/usr/bin',
      TMPDIR: '/s/tmp',
      DPRINT_CACHE_DIR: '/s/tmp/dprint-cache',
    });
  });

  it('opts into a fresh reviewer and into ending the session', () => {
    expect(parseLaunchArgs(['--fresh'])).toMatchObject({ fresh: true });
    expect(parseLaunchArgs(['--end-session', '--pr', '7'])).toMatchObject({
      endSession: true,
      scope: { kind: 'pr', number: 7 },
    });
  });

  it('keys the reviewer by vendor and by PR, resolved commit, or branch', () => {
    const repoRoot = '/repo';
    const rival = 'codex';
    const resolveCommit = (root, ref) =>
      ref === 'HEAD' || ref === 'abc1234' ? 'a'.repeat(40) : ref;
    const pr = ledgerKeyFor({ repoRoot, rival, scope: { kind: 'pr', number: 7 }, branch: 'x' });
    expect(pr).toBe(
      ledgerKeyFor({ repoRoot, rival, scope: { kind: 'pr', number: 7 }, branch: 'y' })
    );
    // The first Claude smoke resumed the Codex thread recorded for the same PR.
    expect(pr).not.toBe(
      ledgerKeyFor({ repoRoot, rival: 'claude', scope: { kind: 'pr', number: 7 }, branch: 'x' })
    );
    const branch = ledgerKeyFor({
      repoRoot,
      rival,
      scope: { kind: 'base', base: 'main' },
      branch: 'x',
    });
    expect(branch).toBe(
      ledgerKeyFor({ repoRoot, rival, scope: { kind: 'uncommitted' }, branch: 'x' })
    );
    expect(branch).not.toBe(pr);
    const byHead = ledgerKeyFor({
      repoRoot,
      rival,
      scope: { kind: 'commit', commit: 'HEAD' },
      branch: 'x',
      resolveCommit,
    });
    const byShort = ledgerKeyFor({
      repoRoot,
      rival,
      scope: { kind: 'commit', commit: 'abc1234' },
      branch: 'x',
      resolveCommit,
    });
    expect(byHead).toBe(byShort);
    expect(byHead).not.toBe(branch);
  });

  it('gives the one retry after a pruned resume its own stream log', () => {
    expect(logPathForAttempt('/s', 1)).toBe('/s/rival.ndjson');
    expect(logPathForAttempt('/s', 2)).toBe('/s/rival-retry.ndjson');
  });

  // Retrying a run the user stopped would spend plan usage they just tried to stop. Only the rival
  // refusing the run earns a fresh attempt.
  it('retries only when the rival itself refused the run', () => {
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.exited })).toBe(true);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.cancelled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.stalled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.logFailed })).toBe(false);
    expect(isRetryableResumeFailure(new Error('something else'))).toBe(false);
  });

  // A retired login exits the same way a pruned thread does, and only the vendor knows the wording;
  // retrying it would fail identically and hide the remedy behind a second stream log.
  it('lets the vendor veto the retry for a login it recognizes as dead', () => {
    const exited = { code: STREAM_FAILURE.exited, message: 'refresh token was already used' };
    const vendor = { isLoginFailure: (error) => /refresh token/.test(error.message) };
    expect(isRetryableResumeFailure(exited, vendor)).toBe(false);
    expect(
      isRetryableResumeFailure({ code: STREAM_FAILURE.exited, message: 'pruned' }, vendor)
    ).toBe(true);
    expect(isRetryableResumeFailure(exited, {})).toBe(true);
  });
});

const OLD_HEAD = 'a'.repeat(40);
const NEW_HEAD = 'b'.repeat(40);

// Stands in for `gh pr view` reporting `reportedHeads` in turn (the last one repeats) while the
// pushed branch sits at `branchHead`, on a clock that advances only by the launcher's waits.
function fakeGitHub(reportedHeads, branchHead) {
  let clock = 0;
  const calls = { reads: 0, waits: [] };
  return {
    calls,
    readPr: () => {
      const headRefOid = reportedHeads[Math.min(calls.reads, reportedHeads.length - 1)];
      calls.reads += 1;
      return { headRefName: 'feature', headRefOid, baseRefOid: 'c'.repeat(40) };
    },
    readBranchHead: (branch) => {
      expect(branch).toBe('feature');
      return branchHead;
    },
    wait: async (ms) => {
      calls.waits.push(ms);
      clock += ms;
    },
    now: () => clock,
  };
}

// PR 2303: a round launched seconds after a push pinned the previous head, and the poster refused
// the finished review because the PR had moved on by then.
describe('settling the PR head before pinning it', () => {
  it('pins the head at once when GitHub already agrees with the branch', async () => {
    const github = fakeGitHub([NEW_HEAD], NEW_HEAD);
    const metadata = await readSettledPullRequest(7, github);
    expect(metadata.headRefOid).toBe(NEW_HEAD);
    expect(github.calls.waits).toEqual([]);
  });

  it('waits out a stale headRefOid until GitHub reports the pushed head', async () => {
    const github = fakeGitHub([OLD_HEAD, OLD_HEAD, NEW_HEAD], NEW_HEAD);
    const metadata = await readSettledPullRequest(7, github);
    expect(metadata.headRefOid).toBe(NEW_HEAD);
    expect(github.calls.waits).toEqual([PR_HEAD_POLL_INTERVAL_MS, PR_HEAD_POLL_INTERVAL_MS]);
  });

  it('refuses, naming both heads, when GitHub never catches up within the bound', async () => {
    const github = fakeGitHub([OLD_HEAD], NEW_HEAD);
    await expect(readSettledPullRequest(7, github)).rejects.toThrow(
      `head ${OLD_HEAD} but origin/feature is at ${NEW_HEAD}`
    );
    const waited = github.calls.waits.reduce((total, ms) => total + ms, 0);
    expect(waited).toBe(PR_HEAD_SETTLE_TIMEOUT_MS);
  });
});

describe('reading the pushed branch head', () => {
  let root;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const run = (args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim();

  // The remote tip, not the local one: a commit made after the push must not count as pushed.
  it('reads the branch tip from origin and refuses a branch origin lacks', () => {
    root = mkdtempSync(join(tmpdir(), 'rival-launch-test-'));
    const origin = join(root, 'origin.git');
    const clone = join(root, 'clone');
    run(['init', '-q', '--bare', '-b', 'main', origin]);
    run(['init', '-q', '-b', 'feature', clone]);
    run(['-C', clone, 'commit', '-q', '--allow-empty', '-m', 'pushed']);
    run(['-C', clone, 'remote', 'add', 'origin', origin]);
    run(['-C', clone, 'push', '-q', 'origin', 'feature']);
    const pushed = run(['-C', clone, 'rev-parse', 'HEAD']);
    run(['-C', clone, 'commit', '-q', '--allow-empty', '-m', 'local only']);

    expect(readRemoteBranchHead(clone, 'feature')).toBe(pushed);
    expect(() => readRemoteBranchHead(clone, 'missing')).toThrow(/no branch named missing/);
  });
});
