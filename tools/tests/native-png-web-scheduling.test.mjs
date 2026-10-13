import { deflateSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { pngChunk, pngFromZlib } from './native-png-fixtures.mjs';

vi.mock(
  '../../experiments/native-architecture/src/drawing/pngTask.ts',
  async () => import('../../experiments/native-architecture/src/drawing/pngTask.web.ts')
);

const GRID = { width: 1024, height: 768 };
const CHANNELS = 4;
const MICROTASK_TURNS = 16;
const NESTED_TIMER_CLAMP_MS = 4;
const TIMER_NESTING_THRESHOLD = 5;
const MAX_MODEL_TASKS = 20000;
const SYNC_WORK_LIMIT = 8192;
// A full grid outlasts several bounded stretches of decoder work, even under a frozen clock.
const MIN_FULL_GRID_PAUSES = 8;
const TIMEOUT_NOTICE = 'Picture observation did not finish. Your drawing is still here.';
const PNG_TASK = '../../experiments/native-architecture/src/drawing/pngTask.ts';

function browserTasks({ registrationFailure, deliveryFailure, starveMessages = false } = {}) {
  let now = 0;
  let nextId = 0;
  let activeTimerNesting = 0;
  const tasks = new Map();
  const timers = new Map();
  const idle = new Map();
  const callbacks = [];
  const stats = {
    messagesPosted: 0,
    messageTasks: 0,
    timerCalls: 0,
    clampedTimers: 0,
    timerTasks: 0,
    deadlineTimers: 0,
    timersCancelled: 0,
    idleCalls: 0,
    idleCancelled: 0,
    openPorts: 0,
    peakOpenPorts: 0,
    closedPorts: 0,
  };
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay = 0, ...args) => {
    if (registrationFailure === 'timer') throw new Error('timer registration failed');
    if (typeof callback !== 'function' || delay < 0 || delay > PNG_TIMEOUT_MS)
      throw new Error('Unexpected decoder timer.');
    const nesting = activeTimerNesting + 1;
    const clamped = nesting > TIMER_NESTING_THRESHOLD && delay < NESTED_TIMER_CLAMP_MS;
    const id = ++nextId;
    timers.set(id, {
      at: now + (clamped ? NESTED_TIMER_CLAMP_MS : delay),
      nesting,
      run: () => callback(...args),
    });
    stats.timerCalls++;
    stats.deadlineTimers += Number(delay > 0);
    stats.clampedTimers += Number(clamped);
    return id;
  });
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id) => {
    if (timers.delete(id)) stats.timersCancelled++;
  });
  vi.stubGlobal('requestIdleCallback', (callback) => {
    const id = ++nextId;
    idle.set(id, callback);
    stats.idleCalls++;
    return id;
  });
  vi.stubGlobal('cancelIdleCallback', (id) => {
    if (idle.delete(id)) stats.idleCancelled++;
  });
  class OwnedMessageChannel {
    constructor() {
      if (registrationFailure === 'constructor') throw new Error('channel registration failed');
      const id = ++nextId;
      const port = () => ({
        onmessage: null,
        onmessageerror: null,
        closed: false,
        close() {
          if (this.closed) return;
          this.closed = true;
          tasks.delete(id);
          stats.openPorts--;
          stats.closedPorts++;
        },
      });
      this.port1 = port();
      this.port2 = port();
      stats.openPorts += 2;
      stats.peakOpenPorts = Math.max(stats.peakOpenPorts, stats.openPorts);
      this.port2.postMessage = () => {
        if (registrationFailure === 'post') throw new Error('message registration failed');
        const onmessage = this.port1.onmessage;
        const onerror = this.port1.onmessageerror;
        const run = () =>
          deliveryFailure
            ? onerror(new Error('message delivery failed'))
            : onmessage({ data: null });
        tasks.set(id, run);
        callbacks.push(run);
        stats.messagesPosted++;
      };
    }
  }
  vi.stubGlobal('MessageChannel', OwnedMessageChannel);
  async function flush() {
    for (let turn = 0; turn < MICROTASK_TURNS; turn++) await Promise.resolve();
  }
  async function step() {
    if (tasks.size && !starveMessages) {
      const [id, run] = tasks.entries().next().value;
      tasks.delete(id);
      activeTimerNesting = 0;
      stats.messageTasks++;
      run();
      await flush();
    } else {
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id);
      now = timer.at;
      activeTimerNesting = timer.nesting;
      stats.timerTasks++;
      timer.run();
      await flush();
    }
    activeTimerNesting = 0;
  }
  return {
    stats,
    callbacks,
    flush,
    step,
    setNow: (value) => {
      now = value;
    },
    pending: () => ({
      messages: tasks.size,
      timers: timers.size,
      idle: idle.size,
      ports: stats.openPorts,
    }),
    async run(promise) {
      let outcome;
      const settled = promise.then(
        (value) => {
          outcome = { status: 'accepted', value };
        },
        (error) => {
          outcome = { status: 'rejected', message: error.message };
        }
      );
      for (let count = 0; !outcome; count++) {
        await flush();
        if (outcome) break;
        if (count >= MAX_MODEL_TASKS || (!tasks.size && !timers.size))
          throw new Error('Browser scheduling model stalled.');
        await step();
      }
      await settled;
      return { ...outcome, ...stats, elapsedVirtualMs: now, pendingAfter: this.pending() };
    },
  };
}

function fullPng(alpha = 255) {
  const rowBytes = GRID.width * CHANNELS;
  const raw = Buffer.alloc(GRID.height * (rowBytes + 1));
  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const index = y * (rowBytes + 1) + 1 + x * CHANNELS;
      raw[index] = (x * 17 + y * 13) & 255;
      raw[index + 1] = (x * 7 + y * 29) & 255;
      raw[index + 2] = (x * 3 + y * 11) & 255;
      raw[index + 3] = alpha;
    }
  }
  const compressed = deflateSync(raw, { level: 0 });
  expect(inflateSync(compressed).equals(raw)).toBe(true);
  return pngFromZlib(compressed, GRID.width, GRID.height);
}

function corruptedPng(kind) {
  const png = fullPng();
  const invalid =
    kind === 'trailing byte' ? Buffer.concat([png, Buffer.from([0])]) : Buffer.from(png);
  if (kind === 'IEND CRC') invalid[invalid.length - 1] ^= 1;
  if (kind === 'IDAT CRC') invalid[invalid.length - 13] ^= 1;
  if (kind === 'Adler checksum') {
    const compressed = Buffer.from(png.subarray(41, 41 + png.readUInt32BE(33)));
    compressed[compressed.length - 1] ^= 1;
    pngChunk('IDAT', compressed).copy(invalid, 33);
  }
  return invalid;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('web PNG validation through browser message tasks', () => {
  it.each([0, 255])(
    'fully validates the 1024x768 stored PNG with alpha%i without nested timers',
    async (alpha) => {
      const png = fullPng(alpha);
      const model = browserTasks();
      const result = await model.run(
        createPngAlphaDecoder().decode(png.toString('base64'), GRID, () => true)
      );
      expect(result.status).toBe('accepted');
      expect(result.value).toBe(alpha < 4);
      expect(result.messageTasks).toBeGreaterThan(MIN_FULL_GRID_PAUSES);
      expect(result.deadlineTimers).toBe(result.messageTasks);
      expect(result.timersCancelled).toBe(result.timerCalls);
      expect(result.clampedTimers).toBe(0);
      expect(result.peakOpenPorts).toBe(2);
      expect(result.pendingAfter).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
    },
    PNG_TIMEOUT_MS + 2000
  );

  it.each(['IEND CRC', 'IDAT CRC', 'Adler checksum', 'trailing byte'])(
    'rejects full-grid %s after opaque pixels',
    async (kind) => {
      const png = corruptedPng(kind);
      const model = browserTasks();
      const result = await model.run(
        createPngAlphaDecoder().decode(png.toString('base64'), GRID, () => true)
      );
      expect(result.status).toBe('rejected');
      expect(result.message).toContain(
        kind === 'Adler checksum' ? 'invalid compressed PNG data' : 'invalid or unsupported PNG'
      );
      expect(result.messageTasks).toBeGreaterThan(MIN_FULL_GRID_PAUSES);
      expect(result.pendingAfter).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
    },
    PNG_TIMEOUT_MS + 2000
  );

  it('requires a real posted task rather than only a resolved promise', async () => {
    const model = browserTasks();
    let settled = false;
    const pending = createPngWork(() => true)
      .pause()
      .then(() => {
        settled = true;
      });
    await model.flush();
    expect(settled).toBe(false);
    expect(model.pending()).toEqual({ messages: 1, timers: 1, idle: 0, ports: 2 });
    await model.run(pending);
    expect(settled).toBe(true);
    expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
  });

  it(
    'keeps cancellation and the decoder finally behind the actual continuation',
    async () => {
      const png = fullPng().toString('base64');
      const model = browserTasks();
      const decoder = createPngAlphaDecoder();
      let current = true;
      const pending = decoder.decode(png, GRID, () => current);
      await model.flush();
      current = false;
      await expect(decoder.decode(png, GRID, () => true)).rejects.toThrow('still settling');
      const result = await model.run(pending);
      expect(result.message).toContain('cancelled');
      expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
      const next = await model.run(decoder.decode(png, GRID, () => true));
      expect(next.status).toBe('accepted');
    },
    PNG_TIMEOUT_MS + 2000
  );

  it('rejects at the unchanged deadline and releases both ports', async () => {
    const model = browserTasks();
    const pending = createPngWork(() => true).pause();
    model.setNow(PNG_TIMEOUT_MS);
    const result = await model.run(pending);
    expect(result.message).toBe(TIMEOUT_NOTICE);
    expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
  });

  it('uses the unchanged absolute deadline if posted message delivery is starved', async () => {
    const model = browserTasks({ starveMessages: true });
    const result = await model.run(createPngWork(() => true).pause());
    expect(result.message).toBe(TIMEOUT_NOTICE);
    expect(result.elapsedVirtualMs).toBe(PNG_TIMEOUT_MS);
    expect(result.timerTasks).toBe(1);
    expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
  });

  it('retains the unchanged synchronous work fence', () => {
    browserTasks();
    expect(() => createPngWork(() => true).charge(SYNC_WORK_LIMIT + 1)).toThrow(
      'synchronous work limit'
    );
  });

  it.each(['constructor', 'timer', 'post'])(
    'rejects %s failure without leaking a task or port',
    async (registrationFailure) => {
      const model = browserTasks({ registrationFailure });
      const result = await model.run(createPngWork(() => true).pause());
      expect(result.status).toBe('rejected');
      expect(result.message).toContain('registration failed');
      expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
    }
  );

  it('rejects a delivery error and fences duplicate callbacks', async () => {
    const model = browserTasks({ deliveryFailure: true });
    const result = await model.run(createPngWork(() => true).pause());
    expect(result.message).toBe('message delivery failed');
    for (const callback of model.callbacks) expect(() => callback()).not.toThrow();
    expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
  });

  it(
    'finishes the full PNG through native continuations even when browser idle work is starved and nested timers clamp',
    async () => {
      vi.resetModules();
      vi.doMock(PNG_TASK, () =>
        vi.importActual('../../experiments/native-architecture/src/drawing/pngTask.ts')
      );
      try {
        const { createPngAlphaDecoder: nativeContinuationDecoder } =
          await import('../../experiments/native-architecture/src/drawing/pngAlpha.ts');
        const png = fullPng();
        const model = browserTasks();
        const result = await model.run(
          nativeContinuationDecoder().decode(png.toString('base64'), GRID, () => true)
        );
        expect({ status: result.status, message: result.message }).toEqual({
          status: 'accepted',
          message: undefined,
        });
        expect(result.clampedTimers).toBeGreaterThan(0);
        expect(result.elapsedVirtualMs).toBeLessThan(PNG_TIMEOUT_MS);
        expect(result.messagesPosted).toBe(0);
        expect(result.idleCalls).toBe(result.idleCancelled);
        expect(model.pending()).toEqual({ messages: 0, timers: 0, idle: 0, ports: 0 });
      } finally {
        vi.doUnmock(PNG_TASK);
        vi.resetModules();
      }
    },
    PNG_TIMEOUT_MS + 2000
  );
});
