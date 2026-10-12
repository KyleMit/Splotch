import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import {
  awaitPngReadStage,
  reportPngReadFailure,
} from '../../experiments/native-architecture/src/export/pngReadDiagnostic.ts';

vi.mock(
  '../../experiments/native-architecture/src/drawing/pngTask',
  async () => import('../../experiments/native-architecture/src/drawing/pngTask.web.ts')
);

const DETAIL_PREFIX = 'SPLOTCH_PNG_DEADLINE_DIAGNOSTIC_3641 ';
const CALLBACK_DELAY_MS = 25;

function boundary() {
  let now = 0;
  let timer;
  let message;
  const close = vi.fn();
  const clear = vi.fn();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
    expect(delay).toBe(PNG_TIMEOUT_MS);
    timer = callback;
    return 1;
  });
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(clear);
  vi.stubGlobal(
    'MessageChannel',
    class {
      port1 = { onmessage: null, onmessageerror: null, close };
      port2 = {
        close,
        postMessage: () => {
          message = this.port1.onmessage;
        },
      };
    }
  );
  return {
    close,
    clear,
    setNow: (value) => {
      now = value;
    },
    message: () => message({ data: null }),
    watchdog: () => timer(),
  };
}

async function detail(promise) {
  let error;
  await promise.catch((caught) => {
    error = caught;
  });
  expect(error).toBeInstanceOf(Error);
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  reportPngReadFailure(error, 'archive-shape');
  expect(log).toHaveBeenCalledTimes(2);
  expect(log.mock.calls[1][0].startsWith(DETAIL_PREFIX)).toBe(true);
  return JSON.parse(log.mock.calls[1][0].slice(DETAIL_PREFIX.length));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('UNRUN web deadline continuation detail source controls', () => {
  it('records a browser message winner while closing both ports and watchdog', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    const pending = work.pause();
    tasks.setNow(CALLBACK_DELAY_MS);
    tasks.message();
    await pending;
    tasks.setNow(PNG_TIMEOUT_MS);
    const summary = await detail(awaitPngReadStage('png-validation', async () => work.check()));
    expect(summary.messageResumes).toBe(1);
    expect(summary.watchdogResumes).toBe(0);
    expect(summary.callbackWaitMs).toBe(CALLBACK_DELAY_MS);
    expect(tasks.close).toHaveBeenCalledTimes(2);
    expect(tasks.clear).toHaveBeenCalledOnce();
  });

  it('records an actual deadline watchdog winner without accepting an expired decode', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    const pending = awaitPngReadStage('png-validation', () => work.pause());
    tasks.setNow(PNG_TIMEOUT_MS);
    tasks.watchdog();
    const summary = await detail(pending);
    expect(summary.at).toBe('resume');
    expect(summary.watchdogResumes).toBe(1);
    expect(summary.messageResumes).toBe(0);
    expect(summary.callbackWaitMs).toBe(PNG_TIMEOUT_MS);
    expect(tasks.close).toHaveBeenCalledTimes(2);
    expect(tasks.clear).toHaveBeenCalledOnce();
  });
});
