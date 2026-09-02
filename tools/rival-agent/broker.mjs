#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from './broker-server.mjs';
import {
  outputPath,
  pendingRequests,
  readDone,
  readFailed,
  readRequests,
  readSession,
  truncateOutput,
  waitForPendingOrEnd,
  writeReply,
} from './spool.mjs';

// Under Claude's ten-minute Bash cap and Codex's exec_command yield; the handler loops on
// `waiting` rather than holding one call open.
export const DEFAULT_NEXT_TIMEOUT_SECONDS = 300;
const USAGE = `usage:
  broker.mjs next   --session <dir> [--timeout-seconds <n>]
  broker.mjs reply  --session <dir> --request <seq> (--exit <code> --output-file <path> | --declined <reason>)
  broker.mjs status --session <dir>`;

export function parseBrokerArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      session: { type: 'string' },
      'timeout-seconds': { type: 'string' },
      request: { type: 'string' },
      exit: { type: 'string' },
      'output-file': { type: 'string' },
      declined: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  if (rest.length > 0 || !['next', 'reply', 'status'].includes(command ?? '')) {
    throw new Error(USAGE);
  }
  if (!values.session) throw new Error(USAGE);
  const session = resolve(values.session);
  if (command === 'next') {
    const timeoutSeconds =
      values['timeout-seconds'] === undefined
        ? DEFAULT_NEXT_TIMEOUT_SECONDS
        : Number(values['timeout-seconds']);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 0) {
      throw new Error('--timeout-seconds must be a non-negative integer');
    }
    return { command, session, timeoutSeconds };
  }
  if (command === 'status') return { command, session };
  const seq = Number(values.request);
  if (!Number.isInteger(seq) || seq < 1) throw new Error('--request must name a request number');
  if (values.declined !== undefined) {
    if (values.exit !== undefined || values['output-file'] !== undefined) throw new Error(USAGE);
    if (!values.declined.trim()) throw new Error('--declined needs a reason the rival can read');
    return { command, session, seq, declined: values.declined };
  }
  const exit = Number(values.exit);
  if (!Number.isInteger(exit)) throw new Error('--exit must be the command exit code');
  if (!values['output-file']) throw new Error('--output-file is required with --exit');
  return { command, session, seq, exit, outputFile: resolve(values['output-file']) };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// The command text appears verbatim so the handler's own permission rules read it: a deny rule on
// `git push --force` and the auto-mode classifier both see exactly what the rival asked for.
export function handlerCommand({ brokerPath, session, request, worktree }) {
  const output = outputPath(session, request.seq);
  return `cd ${shellQuote(worktree)} && ( ${request.command} ) > ${shellQuote(output)} 2>&1; node ${shellQuote(brokerPath)} reply --session ${shellQuote(session)} --request ${request.seq} --exit $? --output-file ${shellQuote(output)}`;
}

export function describeRequest({ brokerPath, session, request, worktree }) {
  return {
    state: 'request',
    seq: request.seq,
    command: request.command,
    why: request.why,
    worktree,
    outputFile: outputPath(session, request.seq),
    handlerCommand: handlerCommand({ brokerPath, session, request, worktree }),
    declineCommand: `node ${shellQuote(brokerPath)} reply --session ${shellQuote(session)} --request ${request.seq} --declined '<reason>'`,
  };
}

export async function nextRequest({ session, timeoutSeconds, brokerPath }) {
  const record = readSession(session);
  if (!record) throw new Error(`no session at ${session}`);
  const outcome = await waitForPendingOrEnd(session, { timeoutMs: timeoutSeconds * 1000 });
  if (outcome.state === 'request') {
    return describeRequest({
      brokerPath,
      session,
      request: outcome.request,
      worktree: record.worktree,
    });
  }
  if (outcome.state === 'done') return { state: 'done', ...outcome.done };
  if (outcome.state === 'failed') return { state: 'failed', ...outcome.failed };
  return { state: 'waiting', session, timeoutSeconds };
}

export function replyToRequest({ session, seq, exit, outputFile, declined }) {
  const request = readRequests(session).find((candidate) => candidate.seq === seq);
  if (!request) throw new Error(`no request ${seq} in ${session}`);
  if (declined !== undefined) {
    writeReply(session, seq, { declined });
    return { state: 'replied', seq, declined };
  }
  if (!existsSync(outputFile)) throw new Error(`output file does not exist: ${outputFile}`);
  const { text, truncated } = truncateOutput(readFileSync(outputFile, 'utf8'));
  writeReply(session, seq, { exit, output: text, truncated, outputFile });
  return { state: 'replied', seq, exit, truncated };
}

export function sessionStatus(session) {
  const record = readSession(session);
  if (!record) throw new Error(`no session at ${session}`);
  const requests = readRequests(session);
  return {
    session,
    worktree: record.worktree,
    rival: record.rival,
    requests: requests.length,
    pending: pendingRequests(session).map(({ seq, command }) => ({ seq, command })),
    done: readDone(session) !== undefined,
    failed: readFailed(session),
  };
}

export async function runBrokerCli(argv, brokerPath) {
  const options = parseBrokerArgs(argv);
  if (options.command === 'next') return nextRequest({ ...options, brokerPath });
  if (options.command === 'reply') return replyToRequest(options);
  return sessionStatus(options.session);
}

if (isEntryPoint(import.meta.url)) {
  runBrokerCli(process.argv.slice(2), fileURLToPath(import.meta.url))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
