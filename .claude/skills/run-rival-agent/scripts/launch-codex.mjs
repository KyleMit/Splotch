#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import {
  assertSubscriptionBilling,
  CODEX_MODEL_SLUG_PATTERN,
  CONFIG_PATH,
  MODEL_ENVIRONMENT_KEY,
  SEED_ENVIRONMENT_KEY,
  SUBSCRIPTION_BASE_URL,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from './codex-subscription-auth.mjs';
import { BROKER_SERVER_PATH, isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';
import { runLaunchCli } from '../../../../tools/rival-agent/launch.mjs';
import { PENDING_REQUEST_TIMEOUT_MS } from '../../../../tools/rival-agent/spool.mjs';
import { codexReducer, STREAM_FAILURE } from '../../../../tools/rival-agent/stream.mjs';
import { FINDINGS_SCHEMA_PATH } from '../../../../tools/rival-agent/validate-findings.mjs';

export { BROKER_SERVER_PATH };
export const RIVAL = 'codex';
// Measured with the model-free `codex sandbox` runner on 2026-09-02: a targeted Vitest file,
// `npm run check`, and `npm run build` all pass inside the disposable worktree; writes to the home
// directory and the canonical checkout are refused; a commit fails because the worktree's gitdir
// lives under the canonical checkout's .git; DNS resolution fails with the network off.
export const TOOL_BOUNDARY =
  '* **Your shell is sandboxed to this worktree, with the network off, and it cannot escalate on its own.** Tests, type checks, builds, and scripts that write inside the worktree or under your own `$TMPDIR` run there. Writes anywhere else fail with a permission error, except that the sandbox also leaves `/tmp` writable — use `$TMPDIR` for scratch and leave `/tmp` alone. Every network call fails, and so does binding a local port, which surfaces as a failing test rather than a permission error. None of that is a decline and none of it is a finding: it is the signal to send that exact command through `run`.';
// The rival's shell runs inside Codex's workspace-write profile rooted at the disposable worktree;
// the network pin restates the measured default on the command line so the boundary is pinned
// where the launcher test can see it rather than inherited from a Codex release.
const SANDBOX_MODE_PIN = 'sandbox_mode="workspace-write"';
const NETWORK_PIN = 'sandbox_workspace_write.network_access=false';
// Ambient tool surfaces that bypass the sandbox. `apps` is the one that matters most: it is a
// built-in MCP server exposing GitHub read *and write* tools, and it is how a review of this very
// skill once posted a review to its own pull request while claiming it could not reach GitHub.
export const ISOLATION_FEATURES = Object.freeze([
  'apps',
  'hooks',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'multi_agent',
  'image_generation',
]);
const TOP_LEVEL_MODEL = /^[ \t]*model[ \t]*=[ \t]*["']([^"']*)["']/m;
const FIRST_TABLE_HEADER = /^[ \t]*\[/m;

// `--ignore-user-config` is what keeps the user's MCP servers off the rival, and it drops the
// configured model with them; reading that one key back keeps the documented default.
export function readConfiguredModel(configToml) {
  const preamble = configToml.split(FIRST_TABLE_HEADER)[0];
  return TOP_LEVEL_MODEL.exec(preamble)?.[1];
}

export function resolveCodexModel(requested, configToml, env = process.env) {
  const model = requested ?? readConfiguredModel(configToml);
  if (!model) {
    const cloudRemedy =
      env.CLAUDE_CODE_REMOTE === 'true'
        ? ` (a cloud session writes that file from ${MODEL_ENVIRONMENT_KEY} at SessionStart; set it in the environment dialog)`
        : '';
    throw new Error(
      `no model: pass --model or set a top-level model in ~/.codex/config.toml${cloudRemedy}`
    );
  }
  if (!CODEX_MODEL_SLUG_PATTERN.test(model)) throw new Error(`unsupported model: ${model}`);
  return model;
}

// Codex's own wording for a stored login it can no longer refresh: the REFRESH_TOKEN_*_MESSAGE
// family in codex-rs/login/src/auth/manager.rs at the pinned version covers an expired, reused, or
// revoked refresh token, an account signed out elsewhere, and a generic failure, all on this prefix.
// `codex login status` is offline and reports the file as healthy, so this is where a dead login
// first becomes visible; the causes share one remedy, so the matcher is as broad as the family.
const LOGIN_FAILURE_PATTERN = /access token could not be refreshed/i;

export function isCodexLoginFailure(error) {
  return error?.code === STREAM_FAILURE.exited && LOGIN_FAILURE_PATTERN.test(error.message ?? '');
}

// The remedy differs by where the launcher runs: a developer machine signs in again, a Claude Code
// on the web session has no browser and takes its login from the seeded environment variable. The
// cause is not claimed beyond what Codex said — a seed refreshed and rotated on another VM is the
// expected one in cloud, not the only one.
export function describeCodexLoginFailure(error, env = process.env) {
  const remedy =
    env.CLAUDE_CODE_REMOTE === 'true'
      ? `This is a Claude Code on the web session, where the usual cause is a seed that another VM has since refreshed and rotated. Re-seed it: run \`npm run rival:seed\` on your machine and paste the value as ${SEED_ENVIRONMENT_KEY} in the cloud environment; the SessionStart hook replaces the stale file at the next session start (docs/CLOUD/Claude.md, "Codex reviews on the ChatGPT plan").`
      : 'Run `codex login` to sign in again.';
  return `Codex can no longer use its stored ChatGPT login (its refresh token has expired, been reused, been revoked, or the account signed out elsewhere). ${remedy}\n${error.message}`;
}

// Inline TOML for the one server the rival may see. JSON string escaping is valid TOML basic-string
// escaping for every character a path or session id can contain.
export function brokerServerToml({ session, brokerServerPath, nodePath, toolTimeoutSeconds }) {
  const string = (value) => JSON.stringify(String(value));
  return `mcp_servers={broker={command=${string(nodePath)},args=[${string(brokerServerPath)}],env={RIVAL_SESSION_DIR=${string(session)}},default_tools_approval_mode="approve",tool_timeout_sec=${toolTimeoutSeconds}}}`;
}

export function buildCodexArgs({
  worktree,
  session,
  brokerServerPath = BROKER_SERVER_PATH,
  nodePath = process.execPath,
  schemaPath = FINDINGS_SCHEMA_PATH,
  model,
  effort,
  rivalSession = { mode: 'create' },
}) {
  const shared = [
    '--json',
    // A -c override of mcp_servers merges into the configured table instead of replacing it, so the
    // only way to leave the user's servers behind is to leave the whole config behind; auth still
    // resolves from CODEX_HOME.
    '--ignore-user-config',
    ...ISOLATION_FEATURES.flatMap((feature) => ['--disable', feature]),
    '-c',
    SANDBOX_MODE_PIN,
    // sandbox_mode alone is not a boundary: with an on-request approval policy Codex escalates out
    // of the sandbox, and a configured auto-reviewer approves it without a human ever seeing the
    // request. Verified — read-only alone created a file; this pin denies it.
    '-c',
    'approval_policy="never"',
    // MCP tool calls are auto-rejected under approval_policy="never" unless the server itself is
    // marked approved; the broker is the one door out of the sandbox.
    '-c',
    brokerServerToml({
      session,
      brokerServerPath,
      nodePath,
      toolTimeoutSeconds: PENDING_REQUEST_TIMEOUT_MS / 1000,
    }),
    '-c',
    NETWORK_PIN,
    '-c',
    `model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`,
    '-c',
    `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`,
    '-c',
    `openai_base_url="${SUBSCRIPTION_BASE_URL}"`,
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '--output-schema',
    schemaPath,
  ];
  // `exec resume` has no --cd flag (the process cwd is the worktree instead) and filters recorded
  // threads by the directory they ran in, which every round's fresh worktree would fail; --all
  // lifts that filter. Both were found by round two exiting 2 before the first event.
  if (rivalSession.mode === 'resume') {
    return ['exec', 'resume', '--all', ...shared, rivalSession.id, '-'];
  }
  return ['exec', '-C', worktree, ...shared, '-'];
}

export const codexVendor = Object.freeze({
  rival: RIVAL,
  command: 'codex',
  reducer: codexReducer,
  toolBoundary: TOOL_BOUNDARY,
  prepare() {
    const { env, stripped } = assertSubscriptionBilling();
    const notes =
      stripped.length > 0 ? [`ignoring API-billing environment: ${stripped.join(', ')}`] : [];
    return { env, notes };
  },
  resolveModel(requested) {
    return resolveCodexModel(
      requested,
      existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf8') : ''
    );
  },
  buildArgs: buildCodexArgs,
  isLoginFailure: isCodexLoginFailure,
  describeLoginFailure: describeCodexLoginFailure,
});

if (isEntryPoint(import.meta.url)) runLaunchCli(process.argv.slice(2), codexVendor);
