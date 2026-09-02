#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { appendRequest, readFailed, waitForReply } from './spool.mjs';

// The one tool the rival sees. Its description is the rival's whole understanding of the broker,
// so it states the economics (a handler turn per call) and that a decline is an ordinary answer.
export const RUN_TOOL = Object.freeze({
  name: 'run',
  description:
    'Ask the native handler to run one shell command in the review worktree on your behalf. The handler executes it under its own permission rules and returns the exit code and output, or declines with a reason — a decline is a normal answer: record what you could not verify and move on. Every call costs the handler a full turn, so read files with your own tools first and batch related commands into one call with && or ;. Commands run with the worktree as the working directory.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The exact shell command to run, relative to the worktree root.',
      },
      why: {
        type: 'string',
        description: 'One line saying what this command verifies. The handler reads it to decide.',
      },
    },
    required: ['command', 'why'],
    additionalProperties: false,
  },
});

export const SERVER_INFO = Object.freeze({ name: 'splotch-rival-broker', version: '1.0.0' });
export const PROTOCOL_VERSION = '2025-06-18';
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_METHOD_NOT_FOUND = -32601;

export function formatReply(reply) {
  if (reply.declined) return `declined by the handler: ${reply.declined}`;
  const truncated = reply.truncated ? ' (output truncated; the full text is in the spool)' : '';
  return `exit ${reply.exit}${truncated}\n${reply.output ?? ''}`;
}

function invalidArguments(value) {
  if (typeof value?.command !== 'string' || !value.command.trim()) return 'command must be text';
  if (typeof value?.why !== 'string' || !value.why.trim()) return 'why must be one line of text';
  return undefined;
}

export function createBrokerHandler(session, { waitOptions } = {}) {
  return async function handle(request) {
    const { id, method, params } = request;
    if (method === 'initialize') {
      return {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return { tools: [RUN_TOOL] };
    if (method === 'tools/call') {
      if (params?.name !== RUN_TOOL.name) {
        throw Object.assign(new Error(`unknown tool ${params?.name}`), {
          code: JSON_RPC_METHOD_NOT_FOUND,
        });
      }
      const problem = invalidArguments(params.arguments);
      if (problem) {
        throw Object.assign(new Error(problem), { code: JSON_RPC_INVALID_PARAMS });
      }
      const { seq } = appendRequest(session, {
        command: params.arguments.command,
        why: params.arguments.why,
      });
      const reply = await waitForReply(session, seq, {
        ...waitOptions,
        shouldStop: () => readFailed(session) !== undefined || waitOptions?.shouldStop?.(),
      });
      if (!reply) {
        return {
          content: [{ type: 'text', text: 'the session ended before the handler replied' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: formatReply(reply) }] };
    }
    if (id === undefined) return undefined;
    throw Object.assign(new Error(`unknown method ${method}`), {
      code: JSON_RPC_METHOD_NOT_FOUND,
    });
  };
}

// MCP's stdio transport is newline-delimited JSON-RPC: one message per line, nothing else on
// stdout. Diagnostics go to stderr, which the launcher folds into its stream log.
export function serveStdio(session, { input = process.stdin, output = process.stdout } = {}) {
  const handle = createBrokerHandler(session);
  const send = (message) => output.write(`${JSON.stringify(message)}\n`);
  createInterface({ input }).on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stderr.write(`broker: ignoring unparsable line\n`);
      return;
    }
    try {
      const result = await handle(message);
      if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      if (message.id !== undefined) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: error.code ?? -32000, message: error.message },
        });
      }
    }
  });
  input.on('end', () => process.exit(0));
}

// Self-contained on purpose: the Codex-side installer copies this folder into ~/.local/libexec
// verbatim, where tools/lib/proc.mjs does not exist.
export function isEntryPoint(url) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === url;
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url)) {
  const session = process.env.RIVAL_SESSION_DIR;
  if (!session) {
    process.stderr.write('broker: RIVAL_SESSION_DIR is not set\n');
    process.exit(1);
  }
  serveStdio(session);
}
