import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectFixtureSession } from '../cdp-session.mjs';

const WORK_BOUND_MS = 3_000;

function transportControl() {
  const sockets = [];
  class ControlledSocket extends EventTarget {
    static CLOSED = 3;
    constructor() {
      super();
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      });
    }
    send(frame) {
      const request = JSON.parse(frame);
      this.sent.push(request);
      queueMicrotask(() =>
        this.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({
              id: request.id,
              result: { result: { type: 'string', value: 'restored-cdp' } },
            }),
          })
        )
      );
    }
    close() {
      this.readyState = ControlledSocket.CLOSED;
      this.dispatchEvent(new Event('close'));
    }
  }
  vi.stubGlobal('WebSocket', ControlledSocket);
  return sockets;
}

describe('legacy CDP anchored admission', () => {
  it('refuses expired work before constructing a socket and restores a connection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-l0-cdp-construction-'));
    const context = { root, phase: 'work', workDeadline: Date.now() - 1 };
    const sockets = transportControl();
    try {
      await expect(connectFixtureSession(context, 'ws://127.0.0.1:40001')).rejects.toThrow(
        /PHASE_DEADLINE/
      );
      expect(sockets).toHaveLength(0);
      context.workDeadline = Date.now() + WORK_BOUND_MS;
      await connectFixtureSession(context, 'ws://127.0.0.1:40001');
      expect(sockets).toHaveLength(1);
    } finally {
      for (const socket of sockets) socket.close();
      vi.unstubAllGlobals();
      rmSync(root, { recursive: true });
    }
  });

  it('refuses cancelled and expired requests before writing or sending and restores the real request owner', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-l0-cdp-request-'));
    const context = { root, phase: 'work', workDeadline: Date.now() + WORK_BOUND_MS };
    const sockets = transportControl();
    try {
      const session = await connectFixtureSession(context, 'ws://127.0.0.1:40001');
      context.workCancelled = true;
      await expect(session.evaluate('owned-mutation')).rejects.toThrow(/WORK_CANCELLED/);
      expect(sockets[0].sent).toHaveLength(0);
      expect(readFileSync(join(root, 'cdp-wire.jsonl.txt'), 'utf8')).toBe('');
      context.workCancelled = false;
      context.workDeadline = Date.now() - 1;
      await expect(session.evaluate('owned-mutation')).rejects.toThrow(/PHASE_DEADLINE/);
      expect(sockets[0].sent).toHaveLength(0);
      context.workDeadline = Date.now() + WORK_BOUND_MS;
      expect(await session.evaluate('restored-source-expression')).toBe('restored-cdp');
      expect(sockets[0].sent[0]).toMatchObject({
        method: 'Runtime.evaluate',
        params: {
          expression: 'restored-source-expression',
          awaitPromise: true,
          returnByValue: true,
        },
      });
    } finally {
      for (const socket of sockets) socket.close();
      vi.unstubAllGlobals();
      rmSync(root, { recursive: true });
    }
  });
});
