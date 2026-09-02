import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import {
  buildCodexArgs,
  buildRoundPrompt,
  buildReviewPrompt,
  describeScope,
  ISOLATION_FEATURES,
  isRetryableResumeFailure,
  parseRunArgs,
  readPromptFile,
  resolveWorktree,
} from '../../.claude/skills/run-rival-agent/scripts/codex-run.mjs';
import {
  API_BILLING_ENVIRONMENT_KEYS,
  assertSubscriptionAuth,
  assertSubscriptionModelProvider,
  stripApiBillingEnvironment,
  SUBSCRIPTION_BASE_URL,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';
import { assertSubscriptionLogin } from '../../.claude/skills/run-rival-agent/scripts/codex-health.mjs';
import {
  parseSessionRecord,
  readSessionRecord,
  removeSessionRecord,
  sessionKey,
  sessionRecordPath,
  writeSessionRecord,
} from '../../.claude/skills/run-rival-agent/scripts/codex-session.mjs';
import {
  CANCELLATION_SIGNALS,
  renderProgressEvent,
  runCodexStreaming,
  STREAM_FAILURE,
} from '../../.claude/skills/run-rival-agent/scripts/codex-stream.mjs';

const PLAN_AUTH = { auth_mode: 'chatgpt', tokens: { access_token: 'token' } };

describe('run-codex billing guard', () => {
  it('accepts a ChatGPT plan login', () => {
    expect(() => assertSubscriptionAuth(PLAN_AUTH)).not.toThrow();
  });

  it('rejects an API-key login instead of silently metering it', () => {
    expect(() => assertSubscriptionAuth({ ...PLAN_AUTH, auth_mode: 'apikey' })).toThrow(/chatgpt/);
    expect(() => assertSubscriptionAuth({ ...PLAN_AUTH, OPENAI_API_KEY: 'sk-x' })).toThrow(
      /API key/
    );
    expect(() => assertSubscriptionAuth({ auth_mode: 'chatgpt', tokens: {} })).toThrow(/token/);
  });

  // Verified against codex-cli 0.149.1: with CODEX_ACCESS_TOKEN set, Codex ignores the stored
  // ChatGPT login entirely and bearer-authenticates against api.openai.com/v1/responses.
  it('strips the environment credentials that outrank the stored plan login', () => {
    expect(API_BILLING_ENVIRONMENT_KEYS).toContain('CODEX_ACCESS_TOKEN');
    expect(API_BILLING_ENVIRONMENT_KEYS).toContain('OPENAI_API_KEY');
  });

  it('strips every variable that would redirect billing', () => {
    const environment = Object.fromEntries(API_BILLING_ENVIRONMENT_KEYS.map((key) => [key, 'x']));
    const { env, stripped } = stripApiBillingEnvironment({ ...environment, PATH: '/usr/bin' });

    expect(stripped).toEqual([...API_BILLING_ENVIRONMENT_KEYS]);
    expect(Object.keys(env)).toEqual(['PATH']);
  });

  it('rejects only a top-level provider override, not a provider definition', () => {
    expect(() => assertSubscriptionModelProvider('model = "gpt-5"\n')).not.toThrow();
    expect(() =>
      assertSubscriptionModelProvider(`model_provider = "${SUBSCRIPTION_MODEL_PROVIDER}"\n`)
    ).not.toThrow();
    expect(() =>
      assertSubscriptionModelProvider('[model_providers.local]\nmodel_provider = "local"\n')
    ).not.toThrow();
    expect(() => assertSubscriptionModelProvider('model_provider = "local"\n')).toThrow(/local/);
  });

  it('fails a health probe whose login is not a ChatGPT session', () => {
    expect(() => assertSubscriptionLogin('Logged in using ChatGPT')).not.toThrow();
    expect(() => assertSubscriptionLogin('Logged in using an API key')).toThrow(/ChatGPT/);
    expect(() => assertSubscriptionLogin('')).toThrow(/no output/);
  });
});

describe('run-codex argument contract', () => {
  it('reviews against main by default', () => {
    expect(parseRunArgs([])).toMatchObject({ profile: 'review', scope: 'base', base: 'main' });
  });

  it('rejects competing review scopes', () => {
    expect(() => parseRunArgs(['--uncommitted', '--base', 'main'])).toThrow(/mutually exclusive/);
  });

  it('keeps review scopes off the ask profile', () => {
    expect(() => parseRunArgs(['--profile', 'ask', '--uncommitted'])).toThrow(/only with/);
    expect(() => parseRunArgs(['--profile', 'ask'])).toThrow(/--prompt-file/);
  });

  it('rejects a model slug that could pass for a flag', () => {
    expect(() => parseRunArgs(['--model', '--yolo'])).toThrow();
    expect(parseRunArgs(['--model', 'gpt-5.6-sol'])).toMatchObject({ model: 'gpt-5.6-sol' });
  });

  it('rejects an unsupported effort', () => {
    expect(() => parseRunArgs(['--effort', 'max'])).toThrow(/effort/);
  });
});

describe('run-codex command construction', () => {
  const options = { profile: 'review', scope: 'base', base: 'main', effort: 'high' };

  // Every one of these was a real escape: an on-request approval policy let a "read-only" run
  // create files, and the built-in `apps` MCP server let one post a review to a pull request.
  it('applies every sandbox-escape control on every profile', () => {
    for (const args of [
      buildCodexArgs(options),
      buildCodexArgs({ ...options, profile: 'ask' }),
      buildCodexArgs({ ...options, resumeThreadId: '00000000-0000-4000-8000-000000000000' }),
    ]) {
      expect(args).toContain('approval_policy="never"');
      expect(args).toContain('mcp_servers={}');
      for (const feature of ISOLATION_FEATURES) {
        expect(args.slice(args.indexOf('--disable'))).toContain(feature);
      }
    }
  });

  it('resumes the recorded thread and reads its prompt from stdin', () => {
    const args = buildCodexArgs({ ...options, resumeThreadId: 'abc' });

    expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(args.slice(-2)).toEqual(['abc', '-']);
  });

  it('pins the read-only sandbox and the subscription provider on every profile', () => {
    for (const args of [
      buildCodexArgs(options),
      buildCodexArgs({ ...options, profile: 'ask' }),
      buildCodexArgs({ ...options, hasInstructions: true }),
    ]) {
      expect(args).toContain('sandbox_mode="read-only"');
      expect(args).toContain(`model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`);
      expect(args).toContain(`cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`);
      // A config-file openai_base_url outranks the provider pin and reaches the metered endpoint.
      expect(args).toContain(`openai_base_url="${SUBSCRIPTION_BASE_URL}"`);
    }
  });

  it('passes a scope flag only when no custom instructions are present', () => {
    expect(buildCodexArgs(options)).toContain('--base=main');
    expect(buildCodexArgs({ ...options, scope: 'uncommitted' })).toContain('--uncommitted');

    // `codex exec review` refuses a scope flag alongside a PROMPT, so instructions swap the flag
    // for the stdin positional and the scope moves into the prompt text.
    const withInstructions = buildCodexArgs({ ...options, hasInstructions: true });
    expect(withInstructions).not.toContain('--base');
    expect(withInstructions.at(-1)).toBe('-');
    expect(buildReviewPrompt({ ...options, hasInstructions: true }, 'focus here')).toContain(
      describeScope(options)
    );
  });

  // A flag-shaped ref must stay attached to its own flag rather than reaching Codex as an option.
  it('keeps a flag-shaped scope value from becoming a second flag', () => {
    const flagShaped = parseRunArgs(['--base=--uncommitted']);

    expect(buildCodexArgs(flagShaped)).toContain('--base=--uncommitted');
    expect(buildCodexArgs(flagShaped)).not.toContain('--uncommitted');
  });

  it('never passes prompt text as a command-line argument', () => {
    const args = buildCodexArgs({ ...options, hasInstructions: true });

    expect(args.some((arg) => arg.includes('focus here'))).toBe(false);
  });
});

describe('run-codex input boundaries', () => {
  it('accepts only a non-empty absolute regular file as the prompt', () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-'));
    try {
      const promptPath = join(directory, 'prompt.md');
      writeFileSync(promptPath, 'focus here\n');

      expect(readPromptFile(promptPath)).toBe('focus here\n');
      expect(() => readPromptFile('prompt.md')).toThrow(/absolute/);
      expect(() => readPromptFile(directory)).toThrow(/regular file/);

      writeFileSync(promptPath, '   \n');
      expect(() => readPromptFile(promptPath)).toThrow(/empty/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses a working directory outside a git worktree', () => {
    expect(() => resolveWorktree('/somewhere', () => undefined)).toThrow(/git worktree/);
    expect(resolveWorktree('/somewhere', () => '/repo')).toBe('/repo');
  });
});

describe('run-codex progress rendering', () => {
  const at = new Date('2026-08-31T11:22:33');

  it('renders the events a reader uses to follow a run', () => {
    expect(renderProgressEvent({ type: 'thread.started', thread_id: 'abc' }, at)).toBe(
      '[11:22:33] thread abc'
    );
    expect(
      renderProgressEvent(
        { type: 'item.started', item: { type: 'command_execution', command: 'git diff' } },
        at
      )
    ).toBe('[11:22:33] cmd git diff');
    expect(
      renderProgressEvent(
        { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } },
        at
      )
    ).toBe('[11:22:33] turn complete (10 in / 2 out)');
  });

  it('reports a failed command but stays quiet about a successful one completing', () => {
    const item = { type: 'command_execution', command: 'npm test' };

    expect(
      renderProgressEvent({ type: 'item.completed', item: { ...item, exit_code: 0 } }, at)
    ).toBe(null);
    expect(
      renderProgressEvent({ type: 'item.completed', item: { ...item, exit_code: 1 } }, at)
    ).toContain('cmd failed (1)');
  });

  it('ignores events it has no line for', () => {
    expect(renderProgressEvent({ type: 'turn.started' }, at)).toBe(null);
  });
});

describe('run-codex streaming lifecycle', () => {
  const STALL_TIMEOUT_MS = 200;
  const SIGKILL_GRACE_MS = 200;

  function streamingRun(
    nodeScript,
    directory,
    logPath = join(directory, `${randomUUID()}.jsonl`),
    createLogStream = undefined
  ) {
    const run = runCodexStreaming(
      {
        command: process.execPath,
        args: ['-e', nodeScript],
        cwd: directory,
        env: process.env,
        prompt: '',
        logPath,
        onProgress: () => {},
        ...(createLogStream ? { createLogStream } : {}),
      },
      STALL_TIMEOUT_MS,
      SIGKILL_GRACE_MS
    );
    run.logPath = logPath;
    return run;
  }

  // Output alone is not progress: a stuck Codex writing retry diagnostics must still trip the
  // watchdog, or the documented ten-minute guarantee is unenforceable.
  it('labels each failure so a caller can tell a refusal from a cancellation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    try {
      await expect(streamingRun('process.exit(3)', directory)).rejects.toMatchObject({
        code: STREAM_FAILURE.exited,
      });
      await expect(streamingRun('setInterval(() => {}, 1000)', directory)).rejects.toMatchObject({
        code: STREAM_FAILURE.stalled,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('terminates a child that only writes to stderr', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    try {
      await expect(
        streamingRun('setInterval(() => process.stderr.write("retrying\\n"), 20)', directory)
      ).rejects.toThrow(/no stream event/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('terminates a child that stops emitting events', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    try {
      await expect(streamingRun('setInterval(() => {}, 1000)', directory)).rejects.toThrow(
        /no stream event/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // Backgrounding a long review is the documented invocation, so a closed shell session must not
  // leave the detached Codex group alive.
  it('cancels on a hangup as well as an interrupt', () => {
    expect(CANCELLATION_SIGNALS).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
  });

  // The log is the run's only audit trail, so a result must never be reported ahead of it. A real
  // file cannot show this: the flush wins the race in practice, so the failing final write is
  // injected instead.
  it('fails the run when the log fails while flushing its final write', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    const failOnFlush = () =>
      new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
        final(callback) {
          callback(new Error('no space left on device'));
        },
      });
    try {
      await expect(
        streamingRun(
          'process.stdout.write(\'{"type":"thread.started","thread_id":"t"}\\n\')',
          directory,
          join(directory, 'unused.jsonl'),
          failOnFlush
        )
      ).rejects.toThrow(/stream log .* failed: no space left on device/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails the run when the log cannot be written', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    try {
      await expect(
        streamingRun(
          'process.stdout.write("{}\\n")',
          directory,
          join(directory, 'absent', 'x.jsonl')
        )
      ).rejects.toThrow(/stream log/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // A leaked handler would silently accumulate across the runs a single session makes.
  it('removes its cancellation handlers once the child exits', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-stream-'));
    const before = process.listenerCount('SIGINT');
    try {
      await streamingRun('process.stdout.write(\'{"type":"turn.completed"}\\n\')', directory);

      expect(process.listenerCount('SIGINT')).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('run-codex review rounds', () => {
  const options = { profile: 'review', scope: 'base', base: 'main', effort: 'high' };

  // --end-session still needs a working directory: main resolves the worktree before it can find
  // the record, so dropping cwd here crashed the documented command instead of ending the session.
  it('opts into a fresh reviewer and into ending the session', () => {
    expect(parseRunArgs(['--fresh'])).toMatchObject({ fresh: true });
    expect(parseRunArgs(['--end-session'])).toEqual({ endSession: true, cwd: process.cwd() });
    expect(parseRunArgs(['--end-session', '--cwd', '/repo'])).toEqual({
      endSession: true,
      cwd: '/repo',
    });
  });

  // Retrying a run the user stopped would spend plan usage they just tried to stop, and would make
  // a second Ctrl-C necessary. Only Codex refusing the run earns a fresh attempt.
  it('retries only when Codex itself refused the run', () => {
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.exited })).toBe(true);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.cancelled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.stalled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.logFailed })).toBe(false);
    expect(isRetryableResumeFailure(new Error('something else'))).toBe(false);
  });

  // An unreachable recorded head means the range is unknown, not empty: telling the reviewer
  // nothing landed would make it skip changes that did.
  it('distinguishes an uncomputable commit range from an empty one', () => {
    const prompt = buildRoundPrompt(options, { rounds: 1, head: 'deadbeef' }, undefined, undefined);

    expect(prompt).toContain('no longer reachable');
    expect(prompt).toContain('deadbeef');
    expect(prompt).not.toContain('(no new commits)');
  });

  // The point of resuming: the reviewer must check its own earlier findings rather than treat the
  // round as a fresh surface, and must be told that finding nothing is a valid answer.
  it('frames a later round as verification rather than a new hunt', () => {
    const prompt = buildRoundPrompt(options, { rounds: 2 }, 'abc123 Fix the thing', undefined);

    expect(prompt).toContain('round 3');
    expect(prompt).toContain('rounds 1 through 2');
    expect(prompt).toContain('abc123 Fix the thing');
    expect(prompt).toMatch(/already reported were actually addressed/);
    expect(prompt).toMatch(/no defects is a correct and expected outcome/i);
  });

  it('tells the reviewer plainly when nothing landed since the last round', () => {
    expect(buildRoundPrompt(options, { rounds: 1 }, '', undefined)).toContain('(no new commits)');
  });

  it('keeps the no-manufactured-findings instruction on a first round too', () => {
    expect(buildReviewPrompt(options, undefined)).toMatch(/do not manufacture findings/i);
  });
});

describe('run-codex session records', () => {
  it('keys a session by checkout and branch', () => {
    expect(sessionKey('/repo', 'main')).toBe(sessionKey('/repo', 'main'));
    expect(sessionKey('/repo', 'main')).not.toBe(sessionKey('/repo', 'other'));
    expect(sessionKey('/repo', 'main')).not.toBe(sessionKey('/elsewhere', 'main'));
  });

  it('round-trips a record and discards an unusable one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-codex-session-'));
    try {
      const path = sessionRecordPath(sessionKey('/repo', 'main'), directory);
      const record = { threadId: randomUUID(), branch: 'main', rounds: 1, head: 'abc' };
      writeSessionRecord(path, record);

      expect(readSessionRecord(path)).toEqual(record);
      expect(statSync(path).mode & 0o077).toBe(0);

      removeSessionRecord(path);
      expect(readSessionRecord(path)).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // A corrupt record must not reach the command line as a thread id of its own.
  it('refuses a record whose thread id is not a uuid', () => {
    expect(parseSessionRecord('{"threadId":"--fresh","rounds":1}')).toBeUndefined();
    expect(
      parseSessionRecord('{"threadId":"00000000-0000-4000-8000-000000000000"}')
    ).toBeUndefined();
  });
});
