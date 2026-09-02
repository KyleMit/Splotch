#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoApiBillingEnvironment } from './splotch-claude-subscription-auth.mjs';
import { verifyInstalledBytes } from './claude-health.mjs';
import { BROKER_SERVER_PATH, isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';
import { runLaunchCli } from '../../../../tools/rival-agent/launch.mjs';
import { PENDING_REQUEST_TIMEOUT_MS } from '../../../../tools/rival-agent/spool.mjs';
import { claudeReducer } from '../../../../tools/rival-agent/stream.mjs';
import { FINDINGS_SCHEMA_PATH } from '../../../../tools/rival-agent/validate-findings.mjs';

export const RIVAL = 'claude';
export const CLAUDE_PATH = '/Users/kylemit/.local/bin/claude';
export const CLAUDE_PROJECTS = '/Users/kylemit/.claude/projects';
const MODELS = new Set(['sonnet', 'opus']);
const DEFAULT_MODEL = 'opus';
export const LOCAL_TOOL_BOUNDARY =
  '* **You have no shell of your own.** `Read`, `Grep`, and `Glob` are your only local tools. Send any command through `run` the first time; do not report the absence of a shell as a decline.';
// The rival's tools: file reads confined to the worktree and the packet, plus the broker. No Bash,
// no web, no edits — the broker is the only door out.
export const RIVAL_TOOLS = 'Read,Grep,Glob';
export const BROKER_TOOL = 'mcp__broker__run';

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
  session,
  packetDir,
  brokerServerPath = BROKER_SERVER_PATH,
  nodePath = process.execPath,
  schemaPath = FINDINGS_SCHEMA_PATH,
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
  localToolBoundary: LOCAL_TOOL_BOUNDARY,
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
