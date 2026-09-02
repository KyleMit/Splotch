import { describe, expect, it } from 'vitest';
import {
  brokerServerToml,
  BROKER_SERVER_PATH,
  buildCodexArgs,
  ISOLATION_FEATURES,
  isRetryableResumeFailure,
  ledgerKeyFor,
  logPathForAttempt,
  parseLaunchArgs,
  readConfiguredModel,
} from '../../.claude/skills/run-rival-agent/scripts/launch-codex.mjs';
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
import { PENDING_REQUEST_TIMEOUT_MS } from '../rival-agent/spool.mjs';
import { STREAM_FAILURE } from '../rival-agent/stream.mjs';
import { FINDINGS_SCHEMA_PATH } from '../rival-agent/validate-findings.mjs';

const PLAN_AUTH = { auth_mode: 'chatgpt', tokens: { access_token: 'token' } };

describe('Codex rival billing guard', () => {
  it('accepts a ChatGPT plan login and rejects an API-key login', () => {
    expect(() => assertSubscriptionAuth(PLAN_AUTH)).not.toThrow();
    expect(() => assertSubscriptionAuth({ ...PLAN_AUTH, auth_mode: 'apikey' })).toThrow(/chatgpt/);
    expect(() => assertSubscriptionAuth({ ...PLAN_AUTH, OPENAI_API_KEY: 'sk-x' })).toThrow(
      /API key/
    );
    expect(() => assertSubscriptionAuth({ auth_mode: 'chatgpt', tokens: {} })).toThrow(/token/);
  });

  // Verified against codex-cli 0.149.1: with CODEX_ACCESS_TOKEN set, Codex ignores the stored
  // ChatGPT login entirely and bearer-authenticates against api.openai.com/v1/responses.
  it('strips every variable that would redirect billing', () => {
    expect(API_BILLING_ENVIRONMENT_KEYS).toContain('CODEX_ACCESS_TOKEN');
    expect(API_BILLING_ENVIRONMENT_KEYS).toContain('OPENAI_API_KEY');
    const environment = Object.fromEntries(API_BILLING_ENVIRONMENT_KEYS.map((key) => [key, 'x']));
    const { env, stripped } = stripApiBillingEnvironment({ ...environment, PATH: '/usr/bin' });
    expect(stripped).toEqual([...API_BILLING_ENVIRONMENT_KEYS]);
    expect(Object.keys(env)).toEqual(['PATH']);
  });

  it('rejects only a top-level provider override, not a provider definition', () => {
    expect(() => assertSubscriptionModelProvider('model = "gpt-5"\n')).not.toThrow();
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

describe('Codex rival launch arguments', () => {
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
  });

  it('rejects a model slug that could pass for a flag and an unsupported effort', () => {
    expect(() => parseLaunchArgs(['--model', '--yolo'])).toThrow(/model/);
    expect(parseLaunchArgs(['--model', 'gpt-5.6-sol'])).toMatchObject({ model: 'gpt-5.6-sol' });
    expect(() => parseLaunchArgs(['--effort', 'max'])).toThrow(/effort/);
  });

  it('opts into a fresh reviewer and into ending the session', () => {
    expect(parseLaunchArgs(['--fresh'])).toMatchObject({ fresh: true });
    expect(parseLaunchArgs(['--end-session', '--pr', '7'])).toMatchObject({
      endSession: true,
      scope: { kind: 'pr', number: 7 },
    });
  });

  it('keys the reviewer by PR, by resolved commit, or by branch', () => {
    const repoRoot = '/repo';
    const resolveCommit = (root, ref) =>
      ref === 'HEAD' || ref === 'abc1234' ? 'a'.repeat(40) : ref;
    const pr = ledgerKeyFor({ repoRoot, scope: { kind: 'pr', number: 7 }, branch: 'x' });
    expect(pr).toBe(ledgerKeyFor({ repoRoot, scope: { kind: 'pr', number: 7 }, branch: 'y' }));
    const branch = ledgerKeyFor({ repoRoot, scope: { kind: 'base', base: 'main' }, branch: 'x' });
    expect(branch).toBe(ledgerKeyFor({ repoRoot, scope: { kind: 'uncommitted' }, branch: 'x' }));
    expect(branch).not.toBe(pr);
    const byHead = ledgerKeyFor({
      repoRoot,
      scope: { kind: 'commit', commit: 'HEAD' },
      branch: 'x',
      resolveCommit,
    });
    const byShort = ledgerKeyFor({
      repoRoot,
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

  it('reads the configured model back because --ignore-user-config drops it', () => {
    expect(readConfiguredModel('model = "gpt-5.6-sol"\nsandbox_mode = "x"\n')).toBe('gpt-5.6-sol');
    expect(readConfiguredModel('[profiles.x]\nmodel = "other"\n')).toBeUndefined();
    expect(readConfiguredModel('')).toBeUndefined();
  });
});

describe('Codex rival command construction', () => {
  const options = {
    worktree: '/tmp/session/worktree',
    session: '/tmp/session',
    nodePath: '/usr/local/bin/node',
    model: 'gpt-5.6-sol',
    effort: 'high',
  };

  // Every one of these was a real escape: an on-request approval policy let a "read-only" run
  // create files, the built-in `apps` MCP server let one post a review to a pull request, and the
  // old `mcp_servers={}` pin merged into the user's config and left a Node REPL server attached.
  it('applies every sandbox-escape control on a first round and on a resume', () => {
    for (const args of [
      buildCodexArgs(options),
      buildCodexArgs({ ...options, resumeThreadId: '00000000-0000-4000-8000-000000000000' }),
    ]) {
      expect(args).toContain('--ignore-user-config');
      expect(args).toContain('approval_policy="never"');
      expect(args).toContain('sandbox_mode="read-only"');
      for (const feature of ISOLATION_FEATURES) {
        expect(args.slice(args.indexOf('--disable'))).toContain(feature);
      }
      expect(args.filter((arg) => arg.startsWith('mcp_servers='))).toHaveLength(1);
    }
  });

  it('attaches exactly the broker, approved, with a tool timeout matching the pending budget', () => {
    const args = buildCodexArgs(options);
    const mcp = args.find((arg) => arg.startsWith('mcp_servers='));
    expect(mcp).toBe(
      brokerServerToml({
        session: '/tmp/session',
        brokerServerPath: BROKER_SERVER_PATH,
        nodePath: '/usr/local/bin/node',
        toolTimeoutSeconds: PENDING_REQUEST_TIMEOUT_MS / 1000,
      })
    );
    expect(mcp).toContain('default_tools_approval_mode="approve"');
    expect(mcp).toContain(`tool_timeout_sec=${PENDING_REQUEST_TIMEOUT_MS / 1000}`);
    expect(mcp).toContain('RIVAL_SESSION_DIR="/tmp/session"');
    expect(mcp.match(/command=/g)).toHaveLength(1);
  });

  it('escapes a session path the way TOML expects', () => {
    const toml = brokerServerToml({
      session: '/tmp/it"s\\odd',
      brokerServerPath: '/b.mjs',
      nodePath: '/n',
      toolTimeoutSeconds: 1,
    });
    expect(toml).toContain('RIVAL_SESSION_DIR="/tmp/it\\"s\\\\odd"');
  });

  it('pins the subscription provider, the model, the effort, and the findings schema', () => {
    const args = buildCodexArgs(options);
    expect(args).toContain(`model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`);
    expect(args).toContain(`cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`);
    expect(args).toContain(`openai_base_url="${SUBSCRIPTION_BASE_URL}"`);
    expect(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2)).toEqual(['-m', 'gpt-5.6-sol']);
    expect(args).toContain('model_reasoning_effort="high"');
    expect(
      args.slice(args.indexOf('--output-schema'), args.indexOf('--output-schema') + 2)
    ).toEqual(['--output-schema', FINDINGS_SCHEMA_PATH]);
    expect(args.slice(args.indexOf('-C'), args.indexOf('-C') + 2)).toEqual([
      '-C',
      '/tmp/session/worktree',
    ]);
  });

  it('reads the prompt from stdin and resumes the recorded thread across worktrees', () => {
    expect(buildCodexArgs(options).slice(0, 1)).toEqual(['exec']);
    expect(buildCodexArgs(options).at(-1)).toBe('-');
    const resumed = buildCodexArgs({ ...options, resumeThreadId: 'abc' });
    expect(resumed.slice(0, 3)).toEqual(['exec', 'resume', '--all']);
    expect(resumed.slice(-2)).toEqual(['abc', '-']);
    // `exec resume` rejects --cd with a usage error, which round two of the first real review hit.
    expect(resumed).not.toContain('-C');
  });

  // Retrying a run the user stopped would spend plan usage they just tried to stop. Only Codex
  // refusing the run earns a fresh attempt.
  it('retries only when Codex itself refused the run', () => {
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.exited })).toBe(true);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.cancelled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.stalled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.logFailed })).toBe(false);
    expect(isRetryableResumeFailure(new Error('something else'))).toBe(false);
  });
});
