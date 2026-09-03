#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoApiBillingEnvironment } from './splotch-claude-subscription-auth.mjs';
import { verifyInstalledBytes } from './claude-health.mjs';
import { BROKER_SERVER_PATH, isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';
import { runLaunchCli } from '../../../../tools/rival-agent/launch.mjs';
import { PENDING_REQUEST_TIMEOUT_MS } from '../../../../tools/rival-agent/spool.mjs';
import { claudeReducer } from '../../../../tools/rival-agent/stream.mjs';
import { FINDINGS_SCHEMA_PATH } from '../../../../tools/rival-agent/validate-findings.mjs';
import { git } from '../../../../tools/rival-agent/worktree.mjs';

export const RIVAL = 'claude';
export const CLAUDE_PATH = '/Users/kylemit/.local/bin/claude';
export const CLAUDE_PROJECTS = '/Users/kylemit/.claude/projects';
const MODELS = new Set(['sonnet', 'opus']);
const DEFAULT_MODEL = 'opus';
// Measured on opus on 2026-09-02 under the settings below: the worktree, the packet, and the
// rival's own `$TMPDIR` are writable; the home directory, the canonical checkout, its `.git`, and
// `/tmp` are not; the credential stores on the deny list are unreadable; the network is refused by
// the sandbox proxy with a 403; binding a local port fails with an ordinary error rather than a
// permission error; Vitest and `git status` run.
export const TOOL_BOUNDARY =
  '* **Your Bash is sandboxed to this worktree and your own `$TMPDIR`, with the network off, and it cannot escalate on its own.** Tests, type checks, builds, and scripts that write inside the worktree run there. Writes anywhere else, reads of the credential stores, and every network call fail with a permission error or a `sandbox_violations` note — that is the sandbox, not a decline, and it is never a finding. It is the signal to send that exact command through `run`. Binding a local port fails as an ordinary error rather than a permission error and is a door too. A `failed to copy trust settings` line is the sandbox proxy, not your command.';
// The rival's tools: file reads confined to the worktree and the packet, a Bash confined by the
// sandbox settings below, and the broker for what that sandbox refuses. No web, no edits.
export const RIVAL_TOOLS = 'Read,Grep,Glob,Bash';
export const BROKER_TOOL = 'mcp__broker__run';
// The credential directory the other vendor's rival keeps its login in; the rival is Claude, so its
// own `~/.claude` stays readable — it is the rival's state, not a secret from it.
export const DENIED_READ_DIRECTORIES = Object.freeze([join(homedir(), '.codex')]);
const WORKTREE_INCLUDE_FILE = '.worktreeinclude';

// A linked worktree's gitdir lives under the canonical checkout's `.git`, and Claude's default
// sandbox grants write access to the whole of it (measured: a `git push` from the rival created a
// branch in the canonical repository). The deny lists are computed from the worktree the rival is
// launched in: the canonical `.git` becomes unwritable, and the files `.worktreeinclude` carries
// into agent worktrees — the secrets a disposable worktree deliberately omits — become unreadable
// at their canonical paths, beside the other vendor's credential directory.
export function resolveSandboxPaths(worktree) {
  const gitCommonDir = git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const canonicalRoot = dirname(gitCommonDir);
  const includePath = join(canonicalRoot, WORKTREE_INCLUDE_FILE);
  const carried = existsSync(includePath)
    ? readFileSync(includePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => resolve(canonicalRoot, line))
    : [];
  return { denyWrite: [gitCommonDir], denyRead: [...DENIED_READ_DIRECTORIES, ...carried] };
}

// `--restricted` ignores settings files but honours `--settings` on the command line (measured).
// `failIfUnavailable` so a host that cannot sandbox refuses to launch rather than launching an
// unconfined rival; `allowUnsandboxedCommands: false` so nothing opts out; an empty strict
// allowlist so the proxy denies every host.
export function sandboxSettings({ denyWrite, denyRead }) {
  return JSON.stringify({
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      network: { strictAllowlist: true, allowedDomains: [] },
      filesystem: { denyWrite, denyRead },
    },
  });
}

export function brokerMcpConfig({ session, brokerServerPath, nodePath }) {
  return JSON.stringify({
    mcpServers: {
      broker: {
        command: nodePath,
        args: [brokerServerPath],
        env: { RIVAL_SESSION_DIR: session },
      },
    },
  });
}

// Claude's own MCP tool timeout would fail a brokered command long before the handler answers.
export function claudeEnvironment(environment = process.env) {
  return { ...environment, MCP_TOOL_TIMEOUT: String(PENDING_REQUEST_TIMEOUT_MS) };
}

// Claude's --json-schema validator refuses the draft 2020-12 `$schema` declaration ("no schema
// with key or ref"); the shape validates fine without it. Codex accepts the file as written.
export function schemaForClaude(schemaPath) {
  const { $schema: _dialect, ...schema } = JSON.parse(readFileSync(schemaPath, 'utf8'));
  return JSON.stringify(schema);
}

export function buildClaudeArgs({
  worktree,
  session,
  packetDir,
  brokerServerPath = BROKER_SERVER_PATH,
  nodePath = process.execPath,
  schemaPath = FINDINGS_SCHEMA_PATH,
  sandboxPaths = resolveSandboxPaths(worktree),
  model,
  effort,
  rivalSession = { mode: 'create', id: randomUUID() },
}) {
  return [
    '--print',
    // --restricted, not --safe-mode: safe mode disables --mcp-config along with everything else,
    // which is how the first probe ran with no broker at all. Restricted mode removes the
    // command-running tools, confines the file tools to the working directories, refuses
    // bypassPermissions, and ignores user and project settings.
    '--restricted',
    '--permission-mode',
    'dontAsk',
    '--tools',
    RIVAL_TOOLS,
    '--allowedTools',
    `${RIVAL_TOOLS},${BROKER_TOOL}`,
    '--settings',
    sandboxSettings(sandboxPaths),
    '--mcp-config',
    brokerMcpConfig({ session, brokerServerPath, nodePath }),
    '--strict-mcp-config',
    '--no-chrome',
    '--add-dir',
    packetDir,
    '--output-format',
    'stream-json',
    '--verbose',
    '--json-schema',
    schemaForClaude(schemaPath),
    ...(rivalSession.mode === 'resume'
      ? ['--resume', rivalSession.id]
      : ['--session-id', rivalSession.id]),
    '--model',
    model,
    '--effort',
    effort,
  ];
}

export function resolveClaudeModel(requested) {
  const model = requested ?? DEFAULT_MODEL;
  if (!MODELS.has(model)) throw new Error(`unsupported model: ${model}`);
  return model;
}

// Ending a session removes the conversation's transcript and its sidecar directory so nothing
// outlives the work. The id comes from the ledger, which only ever holds ids this launcher issued.
export function removeClaudeTranscripts(sessionId, projectsDirectory = CLAUDE_PROJECTS) {
  let removed = 0;
  if (!existsSync(projectsDirectory)) return removed;
  for (const project of readdirSync(projectsDirectory)) {
    for (const entry of [`${sessionId}.jsonl`, sessionId]) {
      const target = join(projectsDirectory, project, entry);
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
        removed += 1;
      }
    }
  }
  return removed;
}

export const claudeVendor = Object.freeze({
  rival: RIVAL,
  command: CLAUDE_PATH,
  reducer: claudeReducer,
  toolBoundary: TOOL_BOUNDARY,
  prepare() {
    assertNoApiBillingEnvironment();
    verifyInstalledBytes(dirname(fileURLToPath(import.meta.url)));
    return { env: claudeEnvironment() };
  },
  resolveModel: resolveClaudeModel,
  buildArgs: buildClaudeArgs,
  newSessionId: () => randomUUID(),
  endSession(record) {
    const removed = removeClaudeTranscripts(record.rivalSessionId);
    process.stderr.write(`removed ${removed} transcript path${removed === 1 ? '' : 's'}\n`);
  },
});

export function main(argv = process.argv.slice(2)) {
  return runLaunchCli(argv, claudeVendor);
}

if (isEntryPoint(import.meta.url)) main();
