import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';
import { pngChunk, pngFromZlib, rgbaPng } from './native-png-fixtures.mjs';

const GRID = { width: 1024, height: 768 };
const CHANNELS = 4;
const FRAME_MS = 1000 / 60;
const MICROTASK_TURNS = 16;
const TIMEOUT_NOTICE = 'Picture observation did not finish. Your drawing is still here.';
const FIXTURE_SHA = 'bec2c1fceb86daff95c56e12ff12bdfc4f96727d7c6e32875fc224e152b3f9ec';
const actualAndroidPng = new URL('./fixtures/native-png-android-rgba-sbit.png', import.meta.url);

function nativeTaskBoundary({ winner = 'idle', missing, throws } = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const tasks = new Map();
  const callbacks = [];
  const stats = {
    frameMs: FRAME_MS,
    frames: 0,
    timerCalls: 0,
    taskCalls: 0,
    timersFired: 0,
    tasksFired: 0,
    timersCancelled: 0,
    tasksCancelled: 0,
    peakTimers: 0,
    peakTasks: 0,
  };
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay = 0, ...args) => {
    if (throws === 'timer') throw new Error('timer registration failed');
    if (typeof callback !== 'function' || delay !== 0) throw new Error('Unexpected decoder timer.');
    const id = ++nextId;
    timers.set(id, { target: now, callback: () => callback(...args) });
    callbacks.push(() => callback(...args));
    stats.timerCalls++;
    stats.peakTimers = Math.max(stats.peakTimers, timers.size);
    return id;
  });
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id) => {
    if (timers.delete(id)) stats.timersCancelled++;
  });
  const request = (callback) => {
    if (throws === 'idle') throw new Error('idle registration failed');
    const id = ++nextId;
    const run = () => callback({ didTimeout: false, timeRemaining: () => 50 });
    tasks.set(id, run);
    callbacks.push(run);
    stats.taskCalls++;
    stats.peakTasks = Math.max(stats.peakTasks, tasks.size);
    return id;
  };
  const cancel = (id) => {
    if (tasks.delete(id)) stats.tasksCancelled++;
  };
  vi.stubGlobal('requestIdleCallback', missing === 'request' ? undefined : request);
  vi.stubGlobal('cancelIdleCallback', missing === 'cancel' ? undefined : cancel);
  async function flush() {
    for (let index = 0; index < MICROTASK_TURNS; index++) await Promise.resolve();
  }
  function step() {
    if (winner === 'idle' && tasks.size) {
      const [id, run] = tasks.entries().next().value;
      tasks.delete(id);
      stats.tasksFired++;
      run();
    } else {
      now += FRAME_MS;
      stats.frames++;
      for (const [id, timer] of [...timers].filter(([, item]) => item.target < now)) {
        if (!timers.delete(id)) continue;
        stats.timersFired++;
        timer.callback();
      }
    }
  }
  return {
    stats,
    callbacks,
    flush,
    step,
    setNow: (value) => {
      now = value;
    },
    pending: () => ({ timers: timers.size, tasks: tasks.size }),
    async run(promise) {
      let outcome;
      const settled = promise.then(
        (empty) => {
          outcome = { status: 'accepted', empty };
        },
        (error) => {
          outcome = { status: 'rejected', message: error.message };
        }
      );
      for (let steps = 0; !outcome; steps++) {
        await flush();
        if (outcome) break;
        if (steps > 2000 || (!timers.size && !tasks.size))
          throw new Error('Native boundary model stalled.');
        step();
      }
      await settled;
      return {
        ...outcome,
        ...stats,
        elapsedVirtualMs: now,
        pendingAfter: { timers: timers.size, tasks: tasks.size },
      };
    },
  };
}

function independentPartialAlphaFixture(alpha) {
  const rowBytes = GRID.width * CHANNELS;
  const raw = Buffer.alloc(GRID.height * (rowBytes + 1));
  for (let y = 0; y < GRID.height; y++) {
    const row = y * (rowBytes + 1);
    for (let x = 0; x < GRID.width; x++) {
      const offset = row + 1 + x * CHANNELS;
      raw[offset] = 190;
      raw[offset + 1] = 80;
      raw[offset + 2] = 10;
      raw[offset + 3] = alpha;
    }
  }
  const compressed = deflateSync(raw);
  expect(inflateSync(compressed).equals(raw)).toBe(true);
  return pngFromZlib(compressed, GRID.width, GRID.height);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native task continuation with owned frame fallback', () => {
  const vectors = [
    [
      'actual Android sBIT producer',
      false,
      () => {
        const png = readFileSync(actualAndroidPng);
        expect(createHash('sha256').update(png).digest('hex')).toBe(FIXTURE_SHA);
        return png;
      },
    ],
    ...[0, 3, 4, 255].map((alpha) => [
      `independent full-grid alpha ${alpha}`,
      alpha < 4,
      () => independentPartialAlphaFixture(alpha),
    ]),
  ];
  it.each(vectors)(
    'decodes the full-size %s through actual owned tasks',
    async (name, expected, fixture) => {
      const png = fixture();
      const realStart = process.hrtime.bigint();
      const model = nativeTaskBoundary();
      const result = await model.run(
        createPngAlphaDecoder().decode(png.toString('base64'), GRID, () => true)
      );
      process.stdout.write(
        'RN_TASK_DECODER ' +
          JSON.stringify({
            name,
            pngSha256: createHash('sha256').update(png).digest('hex'),
            grid: GRID,
            ...result,
            realElapsedMs: Number(process.hrtime.bigint() - realStart) / 1e6,
            scope:
              'Source-bound task/frame ordering model, no native execution or performance acceptance; idle tasks add no synthetic CPU latency.',
          }) +
          '\n'
      );
      expect(result.status).toBe('accepted');
      expect(result.empty).toBe(expected);
      expect(result.taskCalls).toBeGreaterThan(0);
      expect(result.tasksFired).toBe(result.taskCalls);
      expect(result.timersCancelled).toBe(result.timerCalls);
      expect(result.peakTimers).toBe(1);
      expect(result.peakTasks).toBe(1);
      expect(result.pendingAfter).toEqual({ timers: 0, tasks: 0 });
    },
    PNG_TIMEOUT_MS + 2_000
  );

  it.each(['IEND CRC', 'IDAT CRC', 'Adler checksum', 'trailing byte'])(
    'rejects full PNG %s after opaque alpha',
    async (kind) => {
      const png = independentPartialAlphaFixture(255);
      const invalid =
        kind === 'trailing byte' ? Buffer.concat([png, Buffer.from([0])]) : Buffer.from(png);
      if (kind === 'IEND CRC') invalid[invalid.length - 1] ^= 1;
      if (kind === 'IDAT CRC') invalid[invalid.length - 13] ^= 1;
      if (kind === 'Adler checksum') {
        const compressed = Buffer.from(png.subarray(41, 41 + png.readUInt32BE(33)));
        compressed[compressed.length - 1] ^= 1;
        pngChunk('IDAT', compressed).copy(invalid, 33);
      }
      const model = nativeTaskBoundary();
      const result = await model.run(
        createPngAlphaDecoder().decode(invalid.toString('base64'), GRID, () => true)
      );
      expect(result.status).toBe('rejected');
      expect(result.message).toContain(
        kind === 'Adler checksum' ? 'invalid compressed PNG data' : 'invalid or unsupported PNG'
      );
      expect(result.tasksFired).toBeGreaterThan(600);
      expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
    }
  );

  it.each(['timer', 'idle'])('cleans both handles when %s wins', async (winner) => {
    const model = nativeTaskBoundary({ winner });
    const work = createPngWork(() => true);
    const pending = work.pause();
    expect(model.pending()).toEqual({ timers: 1, tasks: 1 });
    const result = await model.run(pending);
    expect(result.status).toBe('accepted');
    expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
    expect(winner === 'idle' ? result.timersCancelled : result.tasksCancelled).toBe(1);
  });

  it.each(['request', 'cancel'])(
    'uses only fallback when public %s is missing',
    async (missing) => {
      const model = nativeTaskBoundary({ missing });
      const result = await model.run(createPngWork(() => true).pause());
      expect(result.status).toBe('accepted');
      expect(result.taskCalls).toBe(0);
      expect(result.timersFired).toBe(1);
      expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
    }
  );

  it('progresses through the owned fallback when idle work is starved', async () => {
    const model = nativeTaskBoundary({ winner: 'timer' });
    const result = await model.run(createPngWork(() => true).pause());
    expect(result.frames).toBe(1);
    expect(result.tasksFired).toBe(0);
    expect(result.tasksCancelled).toBe(1);
  });

  it.each(['idle', 'timer'])(
    'rejects %s registration failure and fences late callbacks',
    async (throws) => {
      const model = nativeTaskBoundary({ throws });
      await expect(createPngWork(() => true).pause()).rejects.toThrow(
        `${throws} registration failed`
      );
      expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
      for (const callback of model.callbacks) expect(() => callback()).not.toThrow();
      expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
    }
  );

  it('ignores duplicates and stale callbacks without settling a later pause', async () => {
    const model = nativeTaskBoundary();
    const work = createPngWork(() => true);
    await model.run(work.pause());
    const old = [...model.callbacks];
    let laterSettled = false;
    const next = work.pause().then(() => {
      laterSettled = true;
    });
    for (const callback of old) {
      callback();
      callback();
    }
    await model.flush();
    expect(laterSettled).toBe(false);
    expect(model.pending()).toEqual({ timers: 1, tasks: 1 });
    await model.run(next);
    expect(laterSettled).toBe(true);
  });

  it('rejects crossing the unchanged deadline at actual continuation', async () => {
    const model = nativeTaskBoundary();
    const work = createPngWork(() => true);
    const pending = work.pause();
    model.setNow(PNG_TIMEOUT_MS);
    const result = await model.run(pending);
    expect(result.message).toBe(TIMEOUT_NOTICE);
    expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
  });

  it('retains one decoder until cancellation reaches its real finally', async () => {
    const png = independentPartialAlphaFixture(0).toString('base64');
    const model = nativeTaskBoundary();
    const decoder = createPngAlphaDecoder();
    let current = true;
    const pending = decoder.decode(png, GRID, () => current);
    await model.flush();
    current = false;
    await expect(decoder.decode(png, GRID, () => true)).rejects.toThrow('still settling');
    expect(model.pending()).toEqual({ timers: 1, tasks: 1 });
    const result = await model.run(pending);
    expect(result.message).toContain('cancelled');
    expect(model.pending()).toEqual({ timers: 0, tasks: 0 });
    await expect(
      decoder.decode(rgbaPng(2, 2).toString('base64'), { width: 2, height: 2 }, () => true)
    ).resolves.toBe(true);
  });
});
