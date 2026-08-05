// Locks the burndown driver's own sequencing — the part that used to be a
// module-scope `while` loop running on import, and so was the only part of
// scripts/audit-burndown/ no test could reach. Both of the 2026-07-25 canary
// bugs lived here rather than in the helpers: a deferral's commit did not count
// toward the push cadence (so a run ending on a deferral left it unpushed), and
// the close-out deletion was positional (so a role that deleted the entry
// itself made the driver eat the NEXT, never-verified finding).
//
// The run is driven for real — pop, verify, implement, review rounds, close
// out, push — with the effects bundle (git, shell, agent runner, log, halt)
// replaced by recorders and the working directory pointed at a temp repo, so
// what is under test is the ordering of the driver's own steps.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBurndownRun, readConfig } from '../audit-burndown/burndown.mjs';
import { deleteEntryByTitle } from '../audit-burndown/lib.mjs';

const AUDIT_PATH = join('docs', 'AUDIT.md');
const BRIEF_PATH = join('.audit-work', 'current-brief.md');
const COMPLETED_LOG = join('.audit-work', 'completed.log');
const COMMENT_STORE = join('.audit-work', 'pending-comments.jsonl');
const DEFERRED_PATH = join('docs', 'AUDIT-DEFERRED.md');

const FIRST_TITLE = '[P1][complexity] First finding';
const SECOND_TITLE = '[P2][dead-code] Second finding';
const FIXTURE = [
  '# Audit',
  '',
  '## Source: Code audit — Area one',
  '',
  `### ${FIRST_TITLE}`,
  '',
  '#### Problem',
  '',
  'The first thing is wrong.',
  '',
  '---',
  '',
  `### ${SECOND_TITLE}`,
  '',
  '#### Problem',
  '',
  'The second thing is wrong.',
  '',
].join('\n');

// A finished agent envelope, in the shape agent-runner.mjs normalizes to.
const verifiedValid = (api) => {
  api.writeBrief();
  return {
    ok: true,
    structured: { verdict: 'VALID', reason: '', brief_path: BRIEF_PATH, e2e_specs: [] },
  };
};
const implemented = (api, summary = 'made the change') => ({
  ok: true,
  sessionId: 'impl-session',
  structured: { success: true, sha: api.commit(), summary },
});
const approved = { ok: true, structured: { status: 'APPROVED', findings: [] } };

// Drives one run against a temp repo. `respond` stands in for every agent call;
// `shellResult` for the deterministic gates. Every observable the driver emits
// in order — its log lines and its pushes — lands in one `events` array, because
// what distinguishes a push at the cadence from the exit flush is *when* it
// happens, not what it looks like.
function createRun({ env = {}, respond, shellResult } = {}) {
  const config = readConfig({ BUNDLE_SPEC: '', ...env });
  const events = [];
  const gitCalls = [];
  const agentCalls = [];
  const runCmdCalls = [];
  const shellCommands = [];
  let head = 1;

  const sha = () => String(head).padStart(40, '0');
  const api = {
    sha,
    commit: () => {
      head += 1;
      return sha();
    },
    writeBrief: () => {
      writeFileSync(BRIEF_PATH, '#### Acceptance criteria\n\n- the finding is fixed\n');
      // The brief must be newer than the issue file or briefIsStale rejects it,
      // and both writes can land in the same millisecond.
      const future = Date.now() / 1000 + 5;
      utimesSync(BRIEF_PATH, future, future);
    },
  };

  const effects = {
    logLine: (message) => events.push(message),
    halt: (message) => {
      events.push(`HALT: ${message}`);
      throw new Error(`HALT: ${message}`);
    },
    git: (...args) => {
      gitCalls.push(args);
      if (args[0] === 'commit') api.commit();
      return { status: 0, stdout: '', stderr: '' };
    },
    gitOk: (...args) => {
      gitCalls.push(args);
      if (args[0] === 'push') events.push('PUSH');
      return true;
    },
    gitOut: (...args) => {
      gitCalls.push(args);
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return sha();
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return config.BRANCH;
      if (args[0] === 'rev-list') return '0';
      return '';
    },
    runCmd: (cmd, args) => {
      runCmdCalls.push([cmd, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    },
    shellOk: (command) => {
      shellCommands.push(command);
      return true;
    },
    shellResult: (command) => {
      shellCommands.push(command);
      return shellResult?.(command) ?? { status: 0, stdout: '', stderr: '' };
    },
    agentStep: async (options) => {
      agentCalls.push(options);
      return respond(options, api);
    },
  };

  return {
    events,
    gitCalls,
    agentCalls,
    runCmdCalls,
    shellCommands,
    api,
    run: createBurndownRun({ config, effects }),
  };
}

const audit = () => readFileSync(AUDIT_PATH, 'utf8');
const eventAt = (events, fragment) => events.findIndex((event) => event.includes(fragment));
const agentTags = (calls) => calls.map((call) => call.tag);

let originalCwd;
let root;

beforeEach(() => {
  originalCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'audit-run-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, '.audit-work'));
  writeFileSync(join(root, AUDIT_PATH), FIXTURE);
  process.chdir(root);
  vi.stubEnv('AUDIT_FILE', AUDIT_PATH);
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe('importing the driver', () => {
  it('does not start a run', async () => {
    const before = process.cwd();
    const module = await import('../audit-burndown/burndown.mjs?fresh');
    expect(typeof module.createBurndownRun).toBe('function');
    // A module that ran its lifecycle on import would have chdir'd to the repo
    // root and recorded its launch before the first assertion could run.
    expect(process.cwd()).toBe(before);
    expect(existsSync(join('.audit-work', 'launch-command'))).toBe(false);
  });
});

describe('push cadence', () => {
  it('pushes a deferral commit where it happens, not at the exit flush', async () => {
    const { events, run } = createRun({ respond: () => ({ ok: false }) });

    await run.execute();

    expect(events.filter((event) => event === 'PUSH' || event.includes('DEFERRED'))).toEqual([
      'PUSH',
      '  DEFERRED (verifier unavailable)',
      'PUSH',
      '  DEFERRED (verifier unavailable)',
    ]);
    expect(eventAt(events, 'backlog empty')).toBeGreaterThan(events.lastIndexOf('PUSH'));
    expect(readFileSync(DEFERRED_PATH, 'utf8')).toContain(FIRST_TITLE);
  });

  it('pushes an invalid drop where it happens', async () => {
    const { events, run } = createRun({
      respond: () => ({
        ok: true,
        structured: { verdict: 'INVALID', reason: 'already fixed', brief_path: '', e2e_specs: [] },
      }),
    });

    await run.execute();

    expect(events.filter((event) => event === 'PUSH' || event.includes('INVALID:'))).toEqual([
      '  INVALID: already fixed',
      'PUSH',
      '  INVALID: already fixed',
      'PUSH',
    ]);
    expect(eventAt(events, 'backlog empty')).toBeGreaterThan(events.lastIndexOf('PUSH'));
    expect(readFileSync(COMPLETED_LOG, 'utf8')).toContain(`[invalid]  ${FIRST_TITLE}`);
    expect(audit()).not.toContain(FIRST_TITLE);
  });

  it('counts a deferral toward a batched cadence, so the next fix reaches it', async () => {
    // PUSH_EVERY=2 with one deferral and one fix: the pair is a batch only if
    // the deferral's commit counted. If it did not, nothing pushes until the
    // exit flush — which lands after the backlog is drained.
    const { events, run } = createRun({
      env: { PUSH_EVERY: '2' },
      respond: (options, api) => {
        if (options.tag.startsWith('iter0001')) return { ok: false };
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement') return implemented(api);
        return approved;
      },
    });

    await run.execute();

    expect(events.filter((event) => event === 'PUSH')).toHaveLength(1);
    expect(events.indexOf('PUSH')).toBeGreaterThan(eventAt(events, '  DONE  '));
    expect(events.indexOf('PUSH')).toBeLessThan(eventAt(events, 'backlog empty'));
  });

  it('halts the run once deferrals go consecutive', async () => {
    const { events, run } = createRun({
      env: { MAX_DEFERRALS: '2' },
      respond: () => ({ ok: false }),
    });

    await expect(run.execute()).rejects.toThrow('2 consecutive deferrals');
    expect(events).toContain('HALT: 2 consecutive deferrals');
  });
});

describe('close-out', () => {
  it('deletes the finding it worked on by title and records the fix', async () => {
    const { events, run } = createRun({
      env: { MAX_ISSUES: '1' },
      respond: (options, api) => {
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement') return implemented(api);
        return approved;
      },
    });

    await run.execute();

    expect(audit()).not.toContain(FIRST_TITLE);
    expect(audit()).toContain(SECOND_TITLE);
    expect(readFileSync(COMPLETED_LOG, 'utf8')).toContain(FIRST_TITLE);
    const record = JSON.parse(readFileSync(COMMENT_STORE, 'utf8').trim());
    expect(record).toMatchObject({ title: FIRST_TITLE, fix: ['made the change'], catches: [] });
    expect(record.problem).toContain('The first thing is wrong.');
    expect(eventAt(events, '  DONE  ')).toBeGreaterThan(-1);
  });

  it('leaves the next finding alone when a role already deleted the entry', async () => {
    // The 2026-07-25 canary: the reviewer talked the implementer into deleting
    // the AUDIT.md entry itself, and the driver's positional delete then removed
    // what had become the first entry — the next, never-verified finding.
    const { events, run } = createRun({
      env: { MAX_ISSUES: '1' },
      respond: (options, api) => {
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement') {
          deleteEntryByTitle(FIRST_TITLE);
          return implemented(api);
        }
        return approved;
      },
    });

    await run.execute();

    expect(audit()).toContain(SECOND_TITLE);
    expect(events).toContain('  entry already gone — a role edited the audit file');
    expect(events).toContain('finished: 1 fixed, 0 dropped, 0 deferred, 1 remaining');
  });
});

describe('review rounds', () => {
  it('resumes the implementer session for a rejected fix and re-reviews it', async () => {
    const { agentCalls, run } = createRun({
      env: { MAX_ISSUES: '1' },
      respond: (options, api) => {
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement')
          return implemented(api, options.sessionId ? 'answered the catch' : 'made the change');
        return options.tag.endsWith('review1')
          ? { ok: true, structured: { status: 'CHANGES_REQUIRED', findings: ['missed a case'] } }
          : approved;
      },
    });

    await run.execute();

    expect(agentTags(agentCalls)).toEqual([
      'iter0001.verify',
      'iter0001.impl',
      'iter0001.review1',
      'iter0001.fix1',
      'iter0001.review2',
    ]);
    expect(agentCalls.at(-2).sessionId).toBe('impl-session');
    expect(agentCalls.at(-2).prompt).toContain('missed a case');
    expect(JSON.parse(readFileSync(COMMENT_STORE, 'utf8').trim())).toMatchObject({
      fix: ['made the change', 'answered the catch'],
      catches: ['missed a case'],
    });
  });

  it('spends no reviewer on a round whose gates are red', async () => {
    let gateRuns = 0;
    const { agentCalls, events, run } = createRun({
      env: { MAX_ISSUES: '1' },
      shellResult: () =>
        (gateRuns += 1) === 1
          ? { status: 1, stdout: 'error TS2339', stderr: '' }
          : { status: 0, stdout: '', stderr: '' },
      respond: (options, api) => {
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement') return implemented(api);
        return approved;
      },
    });

    await run.execute();

    expect(agentTags(agentCalls)).toEqual([
      'iter0001.verify',
      'iter0001.impl',
      'iter0001.fix1',
      'iter0001.review2',
    ]);
    expect(agentCalls.at(-2).prompt).toContain("does not pass the driver's gates");
    expect(agentCalls.at(-2).prompt).toContain('error TS2339');
    expect(eventAt(events, 'round 1: gates red')).toBeGreaterThan(-1);
  });

  it('defers an unreviewable fix as unreviewed, not as rejected', async () => {
    const { events, gitCalls, run } = createRun({
      env: { MAX_ISSUES: '1', MAX_DEFERRALS: '1' },
      respond: (options, api) => {
        if (options.role === 'verify') return verifiedValid(api);
        if (options.role === 'implement') return implemented(api);
        return { ok: false };
      },
    });

    await expect(run.execute()).rejects.toThrow('1 consecutive deferrals');

    expect(eventAt(events, 'reviewer never returned a verdict — rolling back to')).toBeGreaterThan(
      -1
    );
    expect(events).toContain('  DEFERRED (reviewer unavailable)');
    expect(readFileSync(DEFERRED_PATH, 'utf8')).toContain('reviewer unavailable');
    // Unreviewed work never ships: the range is reset and no comment record —
    // the driver's per-commit PR artifact — is written for it.
    expect(gitCalls).toContainEqual(['reset', '-q', '--hard', expect.any(String)]);
    expect(existsSync(COMMENT_STORE)).toBe(false);
  });
});
