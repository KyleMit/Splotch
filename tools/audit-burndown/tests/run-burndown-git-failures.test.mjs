// The driver's own commits and pushes, failing. A commit can fail mid-run when another git process
// holds index.lock, signing fails, or the disk fills; each outcome then has to stop the run before
// it records itself, because completed.log and COMMENT_STORE would name the previous commit and
// the staged residue would fold into the next finding's commit. A push that keeps failing stops
// the run too, rather than piling accepted work up in a container nothing pushes from.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  approved,
  AUDIT_PATH,
  COMMENT_STORE,
  COMPLETED_LOG,
  createRun,
  enterTempBacklog,
  entry,
  exitCodeOf,
  FIRST_TITLE,
  implemented,
  invalidVerdict,
  THREE_FINDING_FIXTURE,
  verifiedValid,
} from './fixtures/run-harness.mjs';

const GIT_REFUSAL = "fatal: Unable to create '.git/index.lock': File exists.";
const REFUSED = { status: 128, stdout: '', stderr: `${GIT_REFUSAL}\n` };
const RESUME_HINT = 'RESUME=1 discards the residue and re-processes the finding';
const BRANCH = 'audit/git-failures';

const refusing = (subcommand) => ({
  git: (...args) => (args[0] === subcommand ? REFUSED : undefined),
});
const refusingDprint = {
  runCmd: (cmd, args) => (cmd === 'npx' && args[0] === 'dprint' ? REFUSED : undefined),
};

// Read rather than probed for existence, so a record written in error shows the sha it names.
const recorded = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const approvedFix = (options, api) => {
  if (options.role === 'verify') return verifiedValid(api);
  if (options.role === 'implement') return implemented(api);
  return approved;
};

beforeEach(enterTempBacklog);

describe('a commit-path step that fails', () => {
  // The verifier is unavailable, so the finding defers. A deferral writes neither completed.log
  // nor COMMENT_STORE; what it records after its commit is the counters, and with the default
  // cadence the push and the DEFERRED line that follow them.
  it.each([
    { step: 'dprint fmt', failing: refusingDprint },
    { step: 'git add', failing: refusing('add') },
    { step: 'git commit', failing: refusing('commit') },
  ])('halts a deferral at its $step, before the deferral is counted', async ({ step, failing }) => {
    const { events, run } = createRun({ respond: () => ({ ok: false }), ...failing });

    await expect(run.execute()).rejects.toThrow(`defer: ${step} failed for ${FIRST_TITLE}`);

    expect(events.at(-1)).toBe(
      `HALT: defer: ${step} failed for ${FIRST_TITLE} — ${RESUME_HINT}\n${GIT_REFUSAL}`
    );
    expect(events).not.toContain('PUSH');
    expect(events.some((event) => event.includes('DEFERRED'))).toBe(false);
  });

  it.each(['add', 'commit'])(
    'halts an invalid drop at its git %s, before completed.log records it',
    async (subcommand) => {
      const { events, run } = createRun({
        respond: () => invalidVerdict(),
        ...refusing(subcommand),
      });

      await expect(run.execute()).rejects.toThrow(
        `drop: git ${subcommand} failed for ${FIRST_TITLE}`
      );

      expect(events.at(-1)).toBe(
        `HALT: drop: git ${subcommand} failed for ${FIRST_TITLE} — ${RESUME_HINT}\n${GIT_REFUSAL}`
      );
      expect(recorded(COMPLETED_LOG)).toBeNull();
      expect(events).not.toContain('PUSH');
    }
  );

  // Short of the amend, HEAD is the approved fix with its entry still in the backlog, which a
  // resumed run would rewind. The halt therefore names the hand-finished amend that keeps it.
  it.each(['add', 'commit'])(
    'halts a close-out at its git %s, before completed.log or COMMENT_STORE records the fix',
    async (subcommand) => {
      const { events, run } = createRun({ respond: approvedFix, ...refusing(subcommand) });

      await expect(run.execute()).rejects.toThrow(
        `close-out: git ${subcommand} failed for ${FIRST_TITLE}`
      );

      expect(events.at(-1)).toBe(
        `HALT: close-out: git ${subcommand} failed for ${FIRST_TITLE} — finish the amend by hand ` +
          `(git add ${AUDIT_PATH}, then git commit --amend --no-edit) to keep the approved fix, ` +
          `which RESUME=1 alone rewinds and re-processes\n${GIT_REFUSAL}`
      );
      expect(recorded(COMPLETED_LOG)).toBeNull();
      expect(recorded(COMMENT_STORE)).toBeNull();
      expect(events.some((event) => event.startsWith('  DONE'))).toBe(false);
    }
  );
});

describe('a push that keeps failing', () => {
  const FOUR_FINDING_FIXTURE = [
    THREE_FINDING_FIXTURE,
    ...entry('[P4][naming] Fourth finding', 'The fourth thing is wrong.'),
  ].join('\n');
  const pushAttempts = (gitCalls) => gitCalls.filter(([command]) => command === 'push').length;

  it('halts the run at the third consecutive failure', async () => {
    writeFileSync(AUDIT_PATH, THREE_FINDING_FIXTURE);
    const { events, gitCalls, run } = createRun({
      env: { BRANCH },
      respond: () => invalidVerdict(),
      gitOk: (...args) => args[0] !== 'push',
    });

    await expect(run.execute()).rejects.toThrow('3 consecutive pushes to origin failed');

    expect(pushAttempts(gitCalls)).toBe(3);
    expect(events.filter((event) => event.startsWith('  push failed'))).toEqual([
      '  push failed — continuing, will retry next batch',
      '  push failed — continuing, will retry next batch',
    ]);
    expect(events.at(-1)).toBe(
      `HALT: 3 consecutive pushes to origin failed — 3 commit(s) held locally on ${BRANCH}; ` +
        'push them manually before the container is reclaimed'
    );
  });

  it('counts again from zero once a push lands', async () => {
    // Fail, fail, land, fail: without the reset the fourth push is the third failure.
    writeFileSync(AUDIT_PATH, FOUR_FINDING_FIXTURE);
    const landed = [false, false, true, false];
    let attempt = 0;
    const { events, gitCalls, run } = createRun({
      respond: () => invalidVerdict(),
      gitOk: (...args) => args[0] !== 'push' || (landed[attempt++] ?? true),
    });

    expect(await exitCodeOf(run)).toBe(0);

    // The fifth push is the exit flush of the fourth finding's commit.
    expect(pushAttempts(gitCalls)).toBe(5);
    expect(events.some((event) => event.startsWith('HALT'))).toBe(false);
    expect(events).toContain('finished: 0 fixed, 4 dropped, 0 deferred, 0 remaining');
  });

  it('holds and retries a red full suite at every boundary without halting', async () => {
    // PUSH_TEST_CMD gates the push rather than failing it, so its holds never count toward the
    // halt; only the final flush reports the commits still held.
    writeFileSync(AUDIT_PATH, THREE_FINDING_FIXTURE);
    const { events, gitCalls, run } = createRun({
      env: { PUSH_TEST_CMD: 'npm test' },
      respond: () => invalidVerdict(),
      shellOk: (command) => command !== 'npm test',
    });

    expect(await exitCodeOf(run)).toBe(1);

    expect(pushAttempts(gitCalls)).toBe(0);
    expect(events.some((event) => event.startsWith('HALT'))).toBe(false);
    expect(events).toContain(
      'WARNING: 3 commit(s) not on origin — push manually before the container is reclaimed'
    );
  });
});
