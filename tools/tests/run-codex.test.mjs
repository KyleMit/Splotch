import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import {
  buildCodexArgs,
  buildReviewPrompt,
  describeScope,
  parseRunArgs,
  readPromptFile,
  resolveWorktree,
} from '../../.claude/skills/run-codex/scripts/codex-run.mjs';
import {
  API_BILLING_ENVIRONMENT_KEYS,
  assertSubscriptionAuth,
  assertSubscriptionModelProvider,
  stripApiBillingEnvironment,
  SUBSCRIPTION_BASE_URL,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from '../../.claude/skills/run-codex/scripts/codex-subscription-auth.mjs';
import { assertSubscriptionLogin } from '../../.claude/skills/run-codex/scripts/codex-health.mjs';
import {
  CANCELLATION_SIGNALS,
  renderProgressEvent,
  runCodexStreaming,
} from '../../.claude/skills/run-codex/scripts/codex-stream.mjs';

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
