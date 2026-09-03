import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  claudeReducer,
  codexReducer,
  renderClaudeEvent,
  renderCodexEvent,
  runStreaming,
  STREAM_FAILURE,
} from '../stream.mjs';

const NOW = new Date('2026-09-02T10:20:30Z');
let directory;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'rival-stream-test-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

// A stand-in rival: prints the given NDJSON lines with the given gaps, then exits.
function scriptedRival(lines, { gapMs = 0, exitCode = 0, hang = false } = {}) {
  const script = `
    const lines = ${JSON.stringify(lines)};
    let index = 0;
    const tick = () => {
      if (index < lines.length) {
        process.stdout.write(lines[index++] + '\\n');
        setTimeout(tick, ${gapMs});
      } else if (${hang}) {
        setInterval(() => {}, 1000);
      } else {
        process.exit(${exitCode});
      }
    };
    tick();
  `;
  return { command: process.execPath, args: ['-e', script] };
}

async function waitForExit(pid, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

describe('event renderers', () => {
  it('renders Codex commands, broker calls, and turn totals', () => {
    const stamp = NOW.toTimeString().slice(0, 8);
    expect(
      renderCodexEvent(
        { type: 'item.started', item: { type: 'command_execution', command: 'git   status' } },
        NOW
      )
    ).toBe(`[${stamp}] cmd git status`);
    expect(
      renderCodexEvent(
        {
          type: 'item.started',
          item: { type: 'mcp_tool_call', arguments: { command: 'npm test' } },
        },
        NOW
      )
    ).toBe(`[${stamp}] broker npm test`);
    expect(
      renderCodexEvent(
        { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 2 } },
        NOW
      )
    ).toBe(`[${stamp}] turn complete (5 in / 2 out)`);
    expect(renderCodexEvent({ type: 'item.started', item: { type: 'reasoning' } }, NOW)).toBeNull();
  });

  it('renders Claude tool calls and errors', () => {
    const stamp = NOW.toTimeString().slice(0, 8);
    expect(
      renderClaudeEvent(
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'mcp__broker__run', input: { command: 'npm run check' } },
            ],
          },
        },
        NOW
      )
    ).toBe(`[${stamp}] tool mcp__broker__run: npm run check`);
    expect(
      renderClaudeEvent(
        {
          type: 'user',
          message: { content: [{ type: 'tool_result', is_error: true, content: 'nope' }] },
        },
        NOW
      )
    ).toBe(`[${stamp}] tool error: nope`);
  });
});

describe('reducers', () => {
  it('extract the session id, usage, and final message from each vendor', () => {
    const codex = codexReducer.initial();
    codexReducer.reduce(codex, { type: 'thread.started', thread_id: 't1' });
    codexReducer.reduce(codex, {
      type: 'item.completed',
      item: { type: 'agent_message', text: '{}' },
    });
    codexReducer.reduce(codex, { type: 'turn.completed', usage: { input_tokens: 1 } });
    expect(codex).toEqual({
      vendor: 'codex',
      sessionId: 't1',
      usage: { input_tokens: 1 },
      message: '{}',
    });

    const claude = claudeReducer.initial();
    claudeReducer.reduce(claude, { type: 'system', subtype: 'init', session_id: 's1' });
    claudeReducer.reduce(claude, {
      type: 'result',
      subtype: 'success',
      usage: { input_tokens: 2 },
      result: 'prose',
      structured_output: { summary: 'x' },
    });
    expect(claude).toMatchObject({
      sessionId: 's1',
      message: '{"summary":"x"}',
      resultSubtype: 'success',
    });
  });
});

describe('streaming runner', () => {
  it('logs every line, reports progress, and resolves the reduced state', async () => {
    const lines = [
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
      'not json',
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
    ];
    const logPath = join(directory, 'run.ndjson');
    const progress = [];
    const state = await runStreaming({
      ...scriptedRival(lines),
      logPath,
      onProgress: (line) => progress.push(line),
      reducer: codexReducer,
    });
    expect(state).toMatchObject({ sessionId: 't1', message: 'done' });
    expect(readFileSync(logPath, 'utf8')).toBe(`${lines.join('\n')}\n`);
    expect(statSync(logPath).mode & 0o777).toBe(0o600);
    expect(progress.some((line) => line.includes('thread t1'))).toBe(true);
  });

  it('delivers stdin to the rival', async () => {
    const state = await runStreaming({
      command: process.execPath,
      args: [
        '-e',
        `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:s}})+'\\n')})`,
      ],
      stdin: 'the prompt',
      logPath: join(directory, 'stdin.ndjson'),
      reducer: codexReducer,
    });
    expect(state.message).toBe('the prompt');
  });

  it('rejects with the exit failure and the stderr tail on a nonzero exit', async () => {
    await expect(
      runStreaming({
        command: process.execPath,
        args: ['-e', "process.stderr.write('refused'); process.exit(3)"],
        logPath: join(directory, 'exit.ndjson'),
        reducer: codexReducer,
      })
    ).rejects.toMatchObject({
      code: STREAM_FAILURE.exited,
      message: expect.stringContaining('refused'),
    });
  });

  it('terminates a silent rival after the stall timeout', async () => {
    await expect(
      runStreaming(
        {
          ...scriptedRival([JSON.stringify({ type: 'thread.started', thread_id: 't' })], {
            hang: true,
          }),
          logPath: join(directory, 'stall.ndjson'),
          reducer: codexReducer,
        },
        200,
        200
      )
    ).rejects.toMatchObject({ code: STREAM_FAILURE.stalled });
  });

  it('keeps a silent rival alive while the spool shows recent broker traffic', async () => {
    let activity = Date.now();
    const keepAlive = setInterval(() => {
      activity = Date.now();
    }, 20);
    const lines = [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }),
    ];
    try {
      const state = await runStreaming(
        {
          ...scriptedRival(lines, { gapMs: 600 }),
          logPath: join(directory, 'active.ndjson'),
          reducer: codexReducer,
          activityProbe: () => activity,
        },
        200,
        200
      );
      expect(state.message).toBe('ok');
    } finally {
      clearInterval(keepAlive);
    }
  });

  it('kills the whole process group so a grandchild cannot outlive the stall', async () => {
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.stdout.write(JSON.stringify({ type: 'grandchild', pid: child.pid }) + '\\n');
      setInterval(() => {}, 1000);
    `;
    let grandchild;
    await expect(
      runStreaming(
        {
          command: process.execPath,
          args: ['-e', script],
          logPath: join(directory, 'group.ndjson'),
          reducer: {
            initial: () => ({}),
            reduce(state, event) {
              if (event.type === 'grandchild') grandchild = event.pid;
              return state;
            },
            render: () => null,
          },
        },
        300,
        300
      )
    ).rejects.toMatchObject({ code: STREAM_FAILURE.stalled });
    expect(grandchild).toBeGreaterThan(0);
    expect(await waitForExit(grandchild)).toBe(true);
  });

  it('fails the run when the log cannot be written rather than reporting success', async () => {
    const failing = new Writable({
      write(chunk, encoding, callback) {
        callback(new Error('disk full'));
      },
    });
    await expect(
      runStreaming(
        {
          ...scriptedRival([JSON.stringify({ type: 'thread.started', thread_id: 't' })]),
          logPath: join(directory, 'never.ndjson'),
          reducer: codexReducer,
          createLogStream: () => failing,
        },
        5000,
        200
      )
    ).rejects.toMatchObject({ code: STREAM_FAILURE.logFailed });
  });
});
