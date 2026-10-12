import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';
import { resumePngTask } from '../../experiments/native-architecture/src/drawing/pngTask.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import {
  awaitPngReadStage,
  PngDecodeDeadlineError,
  reportPngReadFailure,
} from '../../experiments/native-architecture/src/export/pngReadDiagnostic.ts';

const DETAIL_PREFIX = 'SPLOTCH_PNG_DEADLINE_DIAGNOSTIC_3641 ';
const PRIVATE_MATERIAL = 'private://no-archive-path-id-filename-body-or-stack';
const SLICE_UNITS = 4096;
const CALLBACK_DELAY_MS = 25;
const UNTIMED_CPU_MS = 100;

function boundary({ missingIdle = false, timerWins = false } = {}) {
  let now = 0;
  let idle;
  let timer;
  const clear = vi.fn();
  const cancel = vi.fn();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
    expect(delay).toBe(0);
    timer = callback;
    return 1;
  });
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(clear);
  vi.stubGlobal(
    'requestIdleCallback',
    missingIdle
      ? undefined
      : (callback) => {
          idle = callback;
          return 2;
        }
  );
  vi.stubGlobal('cancelIdleCallback', missingIdle ? undefined : cancel);
  return {
    clear,
    cancel,
    advance: (value) => {
      now += value;
    },
    fire: () => {
      (timerWins || missingIdle ? timer : idle)();
    },
    duplicates: () => {
      idle?.();
      timer?.();
    },
  };
}

function detailFrom(error) {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  reportPngReadFailure(error, 'archive-shape');
  expect(log).toHaveBeenCalledTimes(2);
  expect(log.mock.calls[0][0]).toBe(
    'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 {"stage":"png-validation","reason":"decode-deadline"}'
  );
  expect(log.mock.calls[1][0].startsWith(DETAIL_PREFIX)).toBe(true);
  return JSON.parse(log.mock.calls[1][0].slice(DETAIL_PREFIX.length));
}

async function caught(promise) {
  let fault;
  await promise.catch((error) => {
    fault = error;
  });
  expect(fault).toBeInstanceOf(Error);
  return fault;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('UNRUN bounded PNG deadline detail source controls', () => {
  it.each([
    ['idle', {}, 'idleResumes'],
    ['timer with idle', { timerWins: true }, 'timerWithIdleResumes'],
    ['timer without idle', { missingIdle: true }, 'timerWithoutIdleResumes'],
  ])(
    'records a real %s continuation without duplicate settlement',
    async (_name, options, field) => {
      const tasks = boundary(options);
      const work = createPngWork(() => true);
      work.phase('inflating');
      work.charge(SLICE_UNITS);
      const pause = work.pause();
      tasks.advance(CALLBACK_DELAY_MS);
      tasks.fire();
      await pause;
      tasks.duplicates();
      tasks.advance(PNG_TIMEOUT_MS - CALLBACK_DELAY_MS);
      const error = await caught(awaitPngReadStage('png-validation', async () => work.check()));
      const summary = detailFrom(error);
      expect(summary).toEqual({
        schema: 'ROOT_NATIVE_PNG_DEADLINE_DETAIL_3641_V1',
        phase: 'inflating',
        at: 'check',
        totalUnits: SLICE_UNITS,
        sliceUnits: 0,
        pauseRequests: 1,
        idleResumes: Number(field === 'idleResumes'),
        timerWithIdleResumes: Number(field === 'timerWithIdleResumes'),
        timerWithoutIdleResumes: Number(field === 'timerWithoutIdleResumes'),
        messageResumes: 0,
        watchdogResumes: 0,
        elapsedMs: PNG_TIMEOUT_MS,
        callbackWaitMs: CALLBACK_DELAY_MS,
        longestCallbackWaitMs: CALLBACK_DELAY_MS,
        continuationWaitMs: 0,
        longestContinuationWaitMs: 0,
      });
      expect(tasks.clear).toHaveBeenCalledOnce();
      expect(tasks.cancel.mock.calls.length).toBe(Number(!options.missingIdle));
    }
  );

  it('includes the failing resume wait before the unchanged deadline rejects', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    const pending = awaitPngReadStage('png-validation', () => work.pause());
    tasks.advance(PNG_TIMEOUT_MS);
    tasks.fire();
    const error = await caught(pending);
    const summary = detailFrom(error);
    expect(summary.at).toBe('resume');
    expect(summary.callbackWaitMs).toBe(PNG_TIMEOUT_MS);
    expect(summary.idleResumes).toBe(1);
    expect(summary.elapsedMs).toBe(PNG_TIMEOUT_MS);
    expect(tasks.clear).toHaveBeenCalledOnce();
    expect(tasks.cancel).toHaveBeenCalledOnce();
  });

  it('separately records callback-to-await delay and rejects in after-pause check', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    const pending = awaitPngReadStage('png-validation', () => work.pause());
    tasks.advance(CALLBACK_DELAY_MS);
    tasks.fire();
    tasks.advance(PNG_TIMEOUT_MS - CALLBACK_DELAY_MS);
    const error = await caught(pending);
    const summary = detailFrom(error);
    expect(summary.at).toBe('after-pause');
    expect(summary.callbackWaitMs).toBe(CALLBACK_DELAY_MS);
    expect(summary.continuationWaitMs).toBe(PNG_TIMEOUT_MS - CALLBACK_DELAY_MS);
    expect(summary.longestContinuationWaitMs).toBe(PNG_TIMEOUT_MS - CALLBACK_DELAY_MS);
  });

  it('does not mislabel a direct work deadline as scheduler waiting', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    tasks.advance(UNTIMED_CPU_MS);
    work.charge(SLICE_UNITS);
    tasks.advance(PNG_TIMEOUT_MS - UNTIMED_CPU_MS);
    const error = await caught(awaitPngReadStage('png-validation', async () => work.charge()));
    const summary = detailFrom(error);
    expect(summary.at).toBe('charge');
    expect(summary.pauseRequests).toBe(0);
    expect(summary.callbackWaitMs).toBe(0);
    expect(summary.continuationWaitMs).toBe(0);
    expect(summary.totalUnits).toBe(SLICE_UNITS + 1);
  });

  it('preserves cancellation precedence and cleanup without emitting deadline detail', async () => {
    const tasks = boundary();
    let current = true;
    const work = createPngWork(() => current);
    const pending = work.pause();
    let error;
    const rejected = pending.catch((caught) => {
      error = caught;
    });
    current = false;
    tasks.advance(PNG_TIMEOUT_MS);
    tasks.fire();
    await rejected;
    expect(error.message).toContain('cancelled');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    reportPngReadFailure(error, 'png-validation');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toBe(
      'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 {"stage":"png-validation","reason":"decode-cancelled"}'
    );
    expect(tasks.clear).toHaveBeenCalledOnce();
    expect(tasks.cancel).toHaveBeenCalledOnce();
  });

  it('requires the original owned error and excludes arbitrary thrown detail', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = Object.assign(new Error(PRIVATE_MATERIAL), {
      detail: { private: PRIVATE_MATERIAL },
      deadline: { private: PRIVATE_MATERIAL },
    });
    reportPngReadFailure(error, 'archive-text');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toBe(
      'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 {"stage":"archive-text","reason":"other"}'
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(PRIVATE_MATERIAL);
  });

  it('copies only the declared fields even if the owned detail carries extra material', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    tasks.advance(PNG_TIMEOUT_MS);
    const original = await caught(Promise.resolve().then(() => work.check()));
    expect(original).toBeInstanceOf(PngDecodeDeadlineError);
    original.detail.secret = PRIVATE_MATERIAL;
    const wrapped = await caught(
      awaitPngReadStage('png-validation', async () => {
        throw original;
      })
    );
    const summary = detailFrom(wrapped);
    expect(Object.hasOwn(summary, 'secret')).toBe(false);
    expect(JSON.stringify(summary)).not.toContain(PRIVATE_MATERIAL);
  });

  it('contains a throwing second diagnostic transport after owner failure', async () => {
    const tasks = boundary();
    const work = createPngWork(() => true);
    tasks.advance(PNG_TIMEOUT_MS);
    const error = await caught(awaitPngReadStage('png-validation', async () => work.check()));
    vi.spyOn(console, 'info')
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error(PRIVATE_MATERIAL);
      });
    expect(() => reportPngReadFailure(error, 'archive-shape')).not.toThrow();
  });

  it('retains the native continuation promise and source witness contract', async () => {
    const tasks = boundary();
    const checked = vi.fn();
    const pending = resumePngTask(checked, PNG_TIMEOUT_MS);
    tasks.fire();
    await expect(pending).resolves.toBeUndefined();
    expect(checked).toHaveBeenCalledExactlyOnceWith('idle');
  });
});
