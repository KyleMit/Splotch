import { describe, expect, it } from 'vitest';
import {
  brokerServerToml,
  BROKER_SERVER_PATH,
  buildCodexArgs,
  codexVendor,
  describeCodexLoginFailure,
  isCodexLoginFailure,
  ISOLATION_FEATURES,
  readConfiguredModel,
  resolveCodexModel,
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

describe('Codex rival model selection', () => {
  it('reads the configured model back because --ignore-user-config drops it', () => {
    expect(readConfiguredModel('model = "gpt-5.6-sol"\nsandbox_mode = "x"\n')).toBe('gpt-5.6-sol');
    expect(readConfiguredModel('[profiles.x]\nmodel = "other"\n')).toBeUndefined();
    expect(readConfiguredModel('')).toBeUndefined();
  });

  it('prefers the requested model, rejects a flag-shaped one, and demands one from somewhere', () => {
    expect(resolveCodexModel('gpt-5.6-sol', 'model = "other"\n')).toBe('gpt-5.6-sol');
    expect(resolveCodexModel(undefined, 'model = "other"\n')).toBe('other');
    expect(() => resolveCodexModel('--yolo', '')).toThrow(/model/);
    expect(() => resolveCodexModel(undefined, '')).toThrow(/no model/);
    expect(() => resolveCodexModel(undefined, '', {})).not.toThrow(/CODEX_MODEL/);
    expect(() => resolveCodexModel(undefined, '', { CLAUDE_CODE_REMOTE: 'true' })).toThrow(
      /CODEX_MODEL/
    );
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
      buildCodexArgs({
        ...options,
        rivalSession: { mode: 'resume', id: '00000000-0000-4000-8000-000000000000' },
      }),
    ]) {
      expect(args).toContain('--ignore-user-config');
      expect(args).toContain('approval_policy="never"');
      expect(args).toContain('sandbox_mode="workspace-write"');
      expect(args).toContain('sandbox_workspace_write.network_access=false');
      for (const feature of ISOLATION_FEATURES) {
        expect(args.slice(args.indexOf('--disable'))).toContain(feature);
      }
      expect(args.filter((arg) => arg.startsWith('mcp_servers='))).toHaveLength(1);
    }
  });

  // Web search stays on: the findings document is already an outbound channel from a rival that
  // reads the whole disk (NOTES.md, accepted exposures), so the pilot's search pin closed nothing.
  it('leaves web search on', () => {
    expect(buildCodexArgs(options).some((arg) => arg.startsWith('web_search'))).toBe(false);
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
    const resumed = buildCodexArgs({ ...options, rivalSession: { mode: 'resume', id: 'abc' } });
    expect(resumed.slice(0, 3)).toEqual(['exec', 'resume', '--all']);
    expect(resumed.slice(-2)).toEqual(['abc', '-']);
    // `exec resume` rejects --cd with a usage error, which round two of the first real review hit.
    expect(resumed).not.toContain('-C');
  });

  it('exposes the vendor adapter the shared launcher drives', () => {
    expect(codexVendor).toMatchObject({ rival: 'codex', command: 'codex' });
    expect(codexVendor.toolBoundary).toContain('network off');
    expect(codexVendor.toolBoundary).toContain('`run`');
    expect(typeof codexVendor.prepare).toBe('function');
    expect(typeof codexVendor.resolveModel).toBe('function');
    expect(codexVendor.buildArgs).toBe(buildCodexArgs);
    expect(codexVendor.isLoginFailure).toBe(isCodexLoginFailure);
    expect(codexVendor.describeLoginFailure).toBe(describeCodexLoginFailure);
  });
});

// Measured in the 2026-09-02 cloud session on codex-cli 0.152.1 with a fake auth.json whose refresh
// token the auth server had never issued: Codex exits 1 with the "already used" wording, while
// `codex login status` and the health check stay green because both read only the file. The other
// fixtures are the sibling messages from the pinned version's REFRESH_TOKEN_*_MESSAGE family; a
// retry would spend nothing on any of them but would also fix nothing.
describe('Codex rival unusable login', () => {
  const UPSTREAM_REFRESH_FAILURES = [
    'Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.',
    'Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.',
    'Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.',
    'Your access token could not be refreshed. Please log out and sign in again.',
    'Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.',
  ];
  const exited = (message) =>
    Object.assign(
      new Error(`codex exited 1 after "thread.started". Log: /tmp/x.jsonl\nERROR: ${message}`),
      { code: STREAM_FAILURE.exited }
    );
  const reused = exited(UPSTREAM_REFRESH_FAILURES[1]);

  it('recognizes every message of the family, only on an exit', () => {
    for (const message of UPSTREAM_REFRESH_FAILURES) {
      expect(isCodexLoginFailure(exited(message))).toBe(true);
    }
    expect(isCodexLoginFailure({ code: STREAM_FAILURE.exited, message: 'exited 2' })).toBe(false);
    expect(
      isCodexLoginFailure({ code: STREAM_FAILURE.stalled, message: UPSTREAM_REFRESH_FAILURES[1] })
    ).toBe(false);
  });

  it('names the remedy for the platform without claiming a cause Codex did not', () => {
    const cloud = describeCodexLoginFailure(reused, { CLAUDE_CODE_REMOTE: 'true' });
    expect(cloud).toContain('rival:seed');
    expect(cloud).toContain('CODEX_AUTH_JSON');
    expect(cloud).not.toContain('`codex login`');
    expect(cloud).toMatch(/usual cause/);
    const revoked = describeCodexLoginFailure(exited(UPSTREAM_REFRESH_FAILURES[2]), {});
    expect(revoked).toContain('`codex login`');
    expect(revoked).not.toContain('CODEX_AUTH_JSON');
    expect(revoked).not.toMatch(/retired by refresh rotation/);
    expect(revoked).toContain(UPSTREAM_REFRESH_FAILURES[2]);
  });
});
