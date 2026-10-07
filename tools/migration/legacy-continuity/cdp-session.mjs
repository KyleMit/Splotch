import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandRemainingMs } from './command-timing.mjs';

const COMMAND_DEADLINE_MS = 30_000;

export async function connectFixtureSession(context, url) {
  assert.equal(typeof WebSocket, 'function', 'L0_NODE_WEBSOCKET_UNAVAILABLE');
  const openDeadline = Date.now() + commandRemainingMs(context, COMMAND_DEADLINE_MS);
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  const wire = join(context.root, 'cdp-wire.jsonl.txt');
  const connection = { socket, wire, closed: false, finalized: false };
  context.cdpConnections ??= [];
  context.cdpConnections.push(connection);
  writeFileSync(wire, '', { flag: 'wx' });
  const rejectPending = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  socket.addEventListener('message', (event) => {
    appendFileSync(
      wire,
      JSON.stringify({
        receivedAt: new Date().toISOString(),
        received: event.data,
      }) + '\n'
    );
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      rejectPending(error);
      return;
    }
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      entry.resolve(message);
    }
  });
  socket.addEventListener('close', () => {
    connection.closed = true;
    rejectPending(new Error('L0_CDP_CLOSED'));
  });
  socket.addEventListener('error', () => rejectPending(new Error('L0_CDP_ERROR')));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        socket.close();
        reject(new Error('L0_CDP_OPEN_DEADLINE'));
      },
      Math.max(0, openDeadline - Date.now())
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('L0_CDP_OPEN_FAILED'));
      },
      { once: true }
    );
  });
  const request = async (method, params) => {
    const requestDeadline = Date.now() + commandRemainingMs(context, COMMAND_DEADLINE_MS);
    const request = { id: ++id, method, params };
    appendFileSync(
      wire,
      JSON.stringify({ sentAt: new Date().toISOString(), sent: request }) + '\n'
    );
    let timer;
    try {
      const reply = await Promise.race([
        new Promise((resolve, reject) => {
          pending.set(request.id, { resolve, reject });
          socket.send(JSON.stringify(request));
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('L0_CDP_COMMAND_DEADLINE')),
            Math.max(0, requestDeadline - Date.now())
          );
        }),
      ]);
      assert.ok(!reply.error && reply.result, 'L0_CDP_COMMAND_FAILED');
      return reply.result;
    } finally {
      clearTimeout(timer);
      pending.delete(request.id);
    }
  };
  return {
    async browserVersion() {
      return request('Browser.getVersion', {});
    },
    async evaluate(expression) {
      const result = await request('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      assert.ok(!result.exceptionDetails && result.result, 'L0_CDP_COMMAND_FAILED');
      return result.result.value;
    },
  };
}
