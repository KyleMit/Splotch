import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  describeRequest,
  handlerCommand,
  nextRequest,
  parseBrokerArgs,
  replyToRequest,
  sessionStatus,
} from '../broker.mjs';
import { createBrokerHandler, formatReply, RUN_TOOL } from '../broker-server.mjs';
import {
  appendRequest,
  createSessionDirectory,
  lastSpoolActivityAt,
  MAX_INLINE_OUTPUT_CHARS,
  outputPath,
  PENDING_REQUEST_TIMEOUT_MS,
  pendingRequests,
  readReply,
  SESSION_FILES,
  sessionPath,
  spoolActivityAt,
  truncateOutput,
  writeJsonAtomic,
  writeReply,
} from '../spool.mjs';

const BROKER_SERVER = resolve(import.meta.dirname, '../broker-server.mjs');
const BROKER_CLI = resolve(import.meta.dirname, '../broker.mjs');

let root;
let session;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rival-broker-test-'));
  session = createSessionDirectory(randomUUID(), root);
  writeJsonAtomic(sessionPath(session, SESSION_FILES.session), {
    rival: 'codex',
    worktree: '/tmp/worktree',
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('spool', () => {
  it('creates an owner-only session with its request and reply directories', () => {
    expect(statSync(session).mode & 0o777).toBe(0o700);
    for (const directory of [
      SESSION_FILES.requests,
      SESSION_FILES.replies,
      SESSION_FILES.outputs,
    ]) {
      expect(statSync(sessionPath(session, directory)).isDirectory()).toBe(true);
    }
  });

  it('numbers requests in order and reports the unanswered ones oldest first', () => {
    appendRequest(session, { command: 'a', why: 'first' });
    appendRequest(session, { command: 'b', why: 'second' });
    writeReply(session, 1, { exit: 0, output: '' });
    expect(pendingRequests(session).map((request) => request.command)).toEqual(['b']);
    expect(readReply(session, 1)).toMatchObject({ seq: 1, exit: 0 });
  });

  it('refuses a second reply to the same request', () => {
    appendRequest(session, { command: 'a', why: 'first' });
    writeReply(session, 1, { declined: 'no' });
    expect(() => writeReply(session, 1, { exit: 0 })).toThrow(/already has a reply/);
  });

  it('keeps the head and the tail of an oversized output', () => {
    const text = `${'h'.repeat(20_000)}${'m'.repeat(60_000)}${'t'.repeat(40_000)}`;
    const { text: kept, truncated } = truncateOutput(text);
    expect(truncated).toBe(true);
    expect(kept.length).toBeLessThan(MAX_INLINE_OUTPUT_CHARS + 200);
    expect(kept.startsWith('h'.repeat(100))).toBe(true);
    expect(kept.endsWith('t'.repeat(100))).toBe(true);
    expect(kept).toContain('characters omitted');
    expect(truncateOutput('short')).toEqual({ text: 'short', truncated: false });
  });

  it('counts spool traffic as activity', () => {
    const before = lastSpoolActivityAt(session);
    appendRequest(session, { command: 'a', why: 'first' });
    expect(lastSpoolActivityAt(session)).toBeGreaterThanOrEqual(before);
  });

  it('treats an unanswered request as live activity until its own budget runs out', () => {
    const start = Date.now();
    expect(spoolActivityAt(session, () => start + 1000)).toBeLessThanOrEqual(start + 1);
    appendRequest(session, { command: 'npm test', why: 'slow' });
    const later = start + PENDING_REQUEST_TIMEOUT_MS / 2;
    expect(spoolActivityAt(session, () => later)).toBe(later);
    const expired = start + PENDING_REQUEST_TIMEOUT_MS + 1000;
    expect(spoolActivityAt(session, () => expired)).toBeLessThan(expired);
    writeReply(session, 1, { exit: 0, output: '' });
    expect(spoolActivityAt(session, () => expired)).toBeLessThan(expired);
  });
});

describe('broker CLI', () => {
  it('parses each subcommand and rejects a reply that is neither an exit nor a decline', () => {
    expect(parseBrokerArgs(['next', '--session', session])).toMatchObject({
      command: 'next',
      timeoutSeconds: 300,
    });
    expect(parseBrokerArgs(['next', '--session', session, '--timeout-seconds', '0'])).toMatchObject(
      { timeoutSeconds: 0 }
    );
    expect(
      parseBrokerArgs(['reply', '--session', session, '--request', '2', '--declined', 'nope'])
    ).toMatchObject({ command: 'reply', seq: 2, declined: 'nope' });
    expect(() => parseBrokerArgs(['reply', '--session', session, '--request', '2'])).toThrow(
      /--exit/
    );
    expect(() =>
      parseBrokerArgs([
        'reply',
        '--session',
        session,
        '--request',
        '2',
        '--exit',
        '0',
        '--output-file',
        'x',
        '--declined',
        'y',
      ])
    ).toThrow(/usage/);
    expect(() => parseBrokerArgs(['dance', '--session', session])).toThrow(/usage/);
  });

  it('returns waiting when nothing is pending before the timeout', async () => {
    const result = await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI });
    expect(result).toMatchObject({ state: 'waiting' });
  });

  it('hands the oldest unanswered request to the handler with a verbatim command line', async () => {
    appendRequest(session, { command: "git status && echo 'it''s'", why: 'see the tree' });
    const result = await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI });
    expect(result).toMatchObject({ state: 'request', seq: 1, worktree: '/tmp/worktree' });
    expect(result.handlerCommand).toContain("( git status && echo 'it''s' )");
    expect(result.handlerCommand).toContain(`--request 1 --exit $?`);
    expect(result.handlerCommand.startsWith(`cd '/tmp/worktree' && `)).toBe(true);
  });

  it('quotes a worktree path containing a single quote', () => {
    const line = handlerCommand({
      brokerPath: BROKER_CLI,
      session,
      request: { seq: 3, command: 'ls' },
      worktree: "/tmp/it's",
    });
    expect(line.startsWith(`cd '/tmp/it'\\''s' && `)).toBe(true);
  });

  it('records a captured output and a decline', () => {
    appendRequest(session, { command: 'a', why: 'x' });
    appendRequest(session, { command: 'b', why: 'y' });
    const output = outputPath(session, 1);
    writeFileSync(output, 'hello\n');
    expect(replyToRequest({ session, seq: 1, exit: 0, outputFile: output })).toMatchObject({
      state: 'replied',
      exit: 0,
      truncated: false,
    });
    expect(replyToRequest({ session, seq: 2, declined: 'not in this session' })).toMatchObject({
      declined: 'not in this session',
    });
    expect(readReply(session, 1)).toMatchObject({ exit: 0, output: 'hello\n' });
    expect(() => replyToRequest({ session, seq: 9, declined: 'x' })).toThrow(/no request 9/);
    expect(() => replyToRequest({ session, seq: 1, exit: 0, outputFile: '/nope' })).toThrow(
      /already has a reply|does not exist/
    );
  });

  it('reports done or failed once the launcher writes the terminal file', async () => {
    writeJsonAtomic(sessionPath(session, SESSION_FILES.done), { findingsPath: '/f.json' });
    expect(await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI })).toMatchObject(
      {
        state: 'done',
        findingsPath: '/f.json',
      }
    );
    rmSync(sessionPath(session, SESSION_FILES.done));
    writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), { reason: 'exited 1' });
    expect(await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI })).toMatchObject(
      {
        state: 'failed',
        reason: 'exited 1',
      }
    );
  });

  // The rival's second real round probed this: a stale request behind a terminal file must not be
  // handed to the handler, who would run it for a reviewer that has already exited.
  it('never hands out a request once the rival is gone', async () => {
    appendRequest(session, { command: 'touch /tmp/should-not-run', why: 'stale' });
    writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), { reason: 'rival exited' });
    expect(await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI })).toMatchObject(
      { state: 'failed' }
    );
    rmSync(sessionPath(session, SESSION_FILES.failed));
    writeJsonAtomic(sessionPath(session, SESSION_FILES.done), {});
    expect(await nextRequest({ session, timeoutSeconds: 0, brokerPath: BROKER_CLI })).toMatchObject(
      { state: 'done' }
    );
  });

  it('summarizes the session', () => {
    appendRequest(session, { command: 'a', why: 'x' });
    expect(sessionStatus(session)).toMatchObject({
      requests: 1,
      pending: [{ seq: 1, command: 'a' }],
      done: false,
    });
  });

  it('describes the decline shape beside the run shape', () => {
    const described = describeRequest({
      brokerPath: BROKER_CLI,
      session,
      request: { seq: 1, command: 'ls', why: 'w' },
      worktree: '/w',
    });
    expect(described.declineCommand).toContain('--declined');
  });
});

describe('broker server handler', () => {
  it('advertises exactly the run tool', async () => {
    const handle = createBrokerHandler(session);
    expect(await handle({ id: 1, method: 'tools/list' })).toEqual({ tools: [RUN_TOOL] });
    expect(RUN_TOOL.inputSchema.required).toEqual(['command', 'why']);
  });

  it('rejects a call without a reason before it reaches the spool', async () => {
    const handle = createBrokerHandler(session);
    await expect(
      handle({ id: 1, method: 'tools/call', params: { name: 'run', arguments: { command: 'ls' } } })
    ).rejects.toThrow(/why/);
    expect(pendingRequests(session)).toEqual([]);
  });

  it('formats a decline and an exit for the rival', () => {
    expect(formatReply({ declined: 'not here' })).toBe('declined by the handler: not here');
    expect(formatReply({ exit: 2, output: 'boom', truncated: true })).toMatch(
      /^exit 2 \(output truncated/
    );
  });

  it('gives up waiting when the session fails', async () => {
    const handle = createBrokerHandler(session, { waitOptions: { pollMs: 5 } });
    const pending = handle({
      id: 1,
      method: 'tools/call',
      params: { name: 'run', arguments: { command: 'ls', why: 'w' } },
    });
    writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), { reason: 'x' });
    expect(await pending).toMatchObject({ isError: true });
  });
});

function jsonRpcClient(child) {
  const pending = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  let nextId = 0;
  return {
    call(method, params) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return new Promise((resolveCall) => pending.set(id, resolveCall));
    },
    notify(method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    },
  };
}

describe('broker protocol end to end', () => {
  it('carries a request from a fake rival through the spool to the handler CLI and back', async () => {
    const server = spawn(process.execPath, [BROKER_SERVER], {
      env: { ...process.env, RIVAL_SESSION_DIR: session },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      const rival = jsonRpcClient(server);
      const initialized = await rival.call('initialize', { protocolVersion: '2025-06-18' });
      expect(initialized.result.serverInfo.name).toBe('splotch-rival-broker');
      rival.notify('notifications/initialized');
      expect((await rival.call('tools/list')).result.tools.map((tool) => tool.name)).toEqual([
        'run',
      ]);

      const call = rival.call('tools/call', {
        name: 'run',
        arguments: { command: 'echo hi', why: 'probe' },
      });
      const handed = await nextRequest({ session, timeoutSeconds: 5, brokerPath: BROKER_CLI });
      expect(handed).toMatchObject({ state: 'request', command: 'echo hi', why: 'probe' });
      writeFileSync(handed.outputFile, 'hi\n');
      replyToRequest({ session, seq: handed.seq, exit: 0, outputFile: handed.outputFile });
      const answered = await call;
      expect(answered.result.content[0].text).toBe('exit 0\nhi\n');

      const declinedCall = rival.call('tools/call', {
        name: 'run',
        arguments: { command: 'rm -rf /', why: 'chaos' },
      });
      const second = await nextRequest({ session, timeoutSeconds: 5, brokerPath: BROKER_CLI });
      replyToRequest({ session, seq: second.seq, declined: 'destructive' });
      expect((await declinedCall).result.content[0].text).toBe(
        'declined by the handler: destructive'
      );
    } finally {
      server.stdin.end();
      await new Promise((resolveExit) => server.once('close', resolveExit));
    }
  });
});
