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
const LAUNCH_COMMAND_PATH = join('.audit-work', 'launch-command');
const DEFERRED_PATH = join('docs', 'AUDIT-DEFERRED.md');

const FIRST_TITLE = '[P1][complexity] First finding';
const SECOND_TITLE = '[P2][dead-code] Second finding';
const THIRD_TITLE = '[P3][readability] Third finding';
const entry = (title, body) => [`### ${title}`, '', '#### Problem', '', body, '', '---', ''];
const FIXTURE = [
  '# Audit',
  '',
  '## Source: Code audit — Area one',
  '',
  ...entry(FIRST_TITLE, 'The first thing is wrong.'),
  ...entry(SECOND_TITLE, 'The second thing is wrong.'),
].join('\n');
// A run needs three outcomes to show a counter being *reset* rather than merely
// not incremented, so the deferral-streak tests stage one more finding.
const THREE_FINDING_FIXTURE = [FIXTURE, ...entry(THIRD_TITLE, 'The third thing is wrong.')].join(
  '\n'
);

// A finished agent envelope, in the shape agent-runner.mjs normalizes to.
const verifiedValid = (api) => {
  api.writeBrief();
  return {
    ok: true,
    structured: { verdict: 'VALID', reason: '', brief_path: BRIEF_PATH, e2e_specs: [] },
  };
};
const invalidVerdict = (reason = 'already fixed') => ({
  ok: true,
  structured: { verdict: 'INVALID', reason, brief_path: '', e2e_specs: [] },
});
const implemented = (api, summary = 'made the change') => ({
  ok: true,
  sessionId: 'impl-session',
  structured: { success: true, sha: api.commit(), summary },
});
const approved = { ok: true, structured: { status: 'APPROVED', findings: [] } };

// Drives one run against a temp repo. `respond` stands in for every agent call,
// `shellResult` for the deterministic gates, `shellOk` for the tree-is-green
// checks, and `hasCommand` for preflight's runner-binary probe. Every observable
// the driver emits in order — its log lines and its pushes — lands in one
// `events` array, because what distinguishes a push at the cadence from the exit
// flush is *when* it happens, not what it looks like.
function createRun({ env = {}, respond, shellResult, shellOk, hasCommand } = {}) {
  const config = readConfig({ BUNDLE_SPEC: '', ...env });
  const events = [];
  const gitCalls = [];
  const agentCalls = [];
  const runCmdCalls = [];
  const shellCommands = [];
  const probedBinaries = [];
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
    hasCommand: (binary) => {
      probedBinaries.push(binary);
      return hasCommand?.(binary) ?? true;
    },
    shellOk: (command) => {
      shellCommands.push(command);
      return shellOk?.(command) ?? true;
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
    probedBinaries,
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
    const { events, run } = createRun({ respond: () => invalidVerdict() });

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

  it('flushes a commit the batch never filled when the run ends', async () => {
    // The other half of the same 2026-07-25 bug: counting the deferral toward
    // the cadence is useless if a batch that never fills is dropped at exit.
    const { events, run } = createRun({ env: { PUSH_EVERY: '3' }, respond: () => ({ ok: false }) });

    await run.execute();

    expect(events.filter((event) => event === 'PUSH')).toHaveLength(1);
    expect(events.indexOf('PUSH')).toBeGreaterThan(eventAt(events, 'backlog empty'));
    expect(events.indexOf('PUSH')).toBeLessThan(eventAt(events, 'finished:'));
  });

  it('halts the run once deferrals go consecutive', async () => {
    const { events, run } = createRun({
      env: { MAX_DEFERRALS: '2' },
      respond: () => ({ ok: false }),
    });

    await expect(run.execute()).rejects.toThrow('2 consecutive deferrals');
    expect(events).toContain('HALT: 2 consecutive deferrals');
  });

  // "Consecutive" is the whole point of the halt: a run that keeps producing
  // outcomes is working, and only an unbroken deferral streak means the driver
  // is failing at everything it tries. Both non-deferral outcomes therefore
  // break the streak, and a counter that is never reset turns MAX_DEFERRALS into
  // a lifetime budget that stops a healthy run.
  it('breaks the deferral streak on an invalid drop', async () => {
    writeFileSync(AUDIT_PATH, THREE_FINDING_FIXTURE);
    let finding = 0;
    const { events, run } = createRun({
      env: { MAX_DEFERRALS: '2' },
      respond: (options) => {
        if (options.role === 'verify') finding += 1;
        return finding === 2 ? invalidVerdict() : { ok: false };
      },
    });

    await run.execute();

    expect(events).toContain('finished: 0 fixed, 1 dropped, 2 deferred, 0 remaining');
    expect(events.some((event) => event.startsWith('HALT'))).toBe(false);
  });

  it('breaks the deferral streak on an accepted fix', async () => {
    writeFileSync(AUDIT_PATH, THREE_FINDING_FIXTURE);
    let finding = 0;
    const { events, run } = createRun({
      env: { MAX_DEFERRALS: '2' },
      respond: (options, api) => {
        if (options.role === 'verify') {
          finding += 1;
          return finding === 2 ? verifiedValid(api) : { ok: false };
        }
        if (options.role === 'implement') return implemented(api);
        return approved;
      },
    });

    await run.execute();

    expect(events).toContain('finished: 1 fixed, 0 dropped, 2 deferred, 0 remaining');
    expect(events.some((event) => event.startsWith('HALT'))).toBe(false);
  });
});

describe('preflight', () => {
  const passingRun = (overrides) =>
    createRun({ env: { MAX_ISSUES: '7', PUSH_EVERY: '3' }, ...overrides });

  it('probes the runner binary before touching git', () => {
    const { gitCalls, probedBinaries, run } = passingRun({ hasCommand: () => false });

    expect(() => run.preflight()).toThrow('missing dependency: claude');
    expect(probedBinaries).toEqual(['claude']);
    expect(gitCalls).toEqual([]);
  });

  it('leaves an in-flight run’s launch record intact when a gate halts', () => {
    // recordLaunch runs last for exactly this reason: halt() exits the process
    // without restoring the file, so a launch that dies on an already-red tree
    // must not overwrite the record of the run that is still going.
    writeFileSync(LAUNCH_COMMAND_PATH, 'IN_FLIGHT=1 npm run audit:burndown:overnight -- 600\n');
    const { run } = passingRun({ shellOk: () => false });

    expect(() => run.preflight()).toThrow('tree is already red before we start');
    expect(readFileSync(LAUNCH_COMMAND_PATH, 'utf8')).toContain('IN_FLIGHT=1');
  });

  it('records the run’s own knobs once every gate passes', () => {
    // The knobs come from the config the run was built with, not from the
    // ambient environment — a launch-command naming knobs that were never in
    // force is worse than none, since nothing else can re-derive them.
    vi.stubEnv('PUSH_EVERY', '99');
    const { run } = passingRun();

    run.preflight();

    const recorded = readFileSync(LAUNCH_COMMAND_PATH, 'utf8').trim();
    expect(recorded).toContain("PUSH_EVERY='3'");
    expect(recorded).not.toContain('99');
    expect(recorded).toMatch(/-- 7$/);
    expect(readFileSync(join('.audit-work', 'launch-pid'), 'utf8').trim()).toBe(
      String(process.pid)
    );
  });
});

describe('backlog selection', () => {
  const CUSTOM_PATH = join('docs', 'AUDIT-CUSTOM.md');
  const CUSTOM_TITLE = '[P1][complexity] Custom-backlog finding';

  // AUDIT_FILE picks the file the whole run pops, deletes from, stages, and
  // counts, so it has to come from the config like every other knob. Read per
  // call from the ambient environment instead, a run built through the exported
  // seam recorded `AUDIT_FILE='…'` in its launch command — the one fact nothing
  // else can re-derive — while processing a different backlog entirely.
  it('works the backlog its config names, not the ambient one', async () => {
    writeFileSync(
      CUSTOM_PATH,
      [
        '# Audit',
        '',
        '## Source: Code audit — Area two',
        '',
        ...entry(CUSTOM_TITLE, 'The custom thing is wrong.'),
      ].join('\n')
    );
    // Bounded by MAX_HANDLED because the regression this locks does not merely
    // return a wrong answer: popping one backlog while deleting from another
    // re-pops the same finding forever, which would hang the suite instead of
    // failing it.
    const { events, gitCalls, run } = createRun({
      env: { AUDIT_FILE: CUSTOM_PATH, MAX_HANDLED: '1' },
      respond: () => invalidVerdict(),
    });

    await run.execute();

    expect(readFileSync(CUSTOM_PATH, 'utf8')).not.toContain(CUSTOM_TITLE);
    expect(audit()).toContain(FIRST_TITLE);
    expect(gitCalls).toContainEqual(['add', CUSTOM_PATH]);
    expect(events).toContain('finished: 0 fixed, 1 dropped, 0 deferred, 0 remaining');
    // The ambient AUDIT_FILE still names the default backlog throughout: the
    // supplied one is selected by construction, never by mutating the process.
    expect(process.env.AUDIT_FILE).toBe(AUDIT_PATH);
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

describe('iteration tags', () => {
  // A drop is an outcome like any other, so the tag has to advance past it. When
  // it did not, the next finding reused the dropped one's tag: agent-runner.mjs
  // overwrote the drop's `<tag>.json` verify envelope and appended both
  // findings' stderr into one `<tag>.err`.
  it('gives the finding after an invalid drop a tag of its own', async () => {
    let verified = 0;
    const { agentCalls, run } = createRun({
      respond: (options, api) => {
        if (options.role === 'verify') {
          verified += 1;
          return verified === 1 ? invalidVerdict() : verifiedValid(api);
        }
        if (options.role === 'implement') return implemented(api);
        return approved;
      },
    });

    await run.execute();

    expect(agentTags(agentCalls)).toEqual([
      'iter0001.verify',
      'iter0002.verify',
      'iter0002.impl',
      'iter0002.review1',
    ]);
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
