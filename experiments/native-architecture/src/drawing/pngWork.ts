import { resumePngTask } from './pngTask';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { MAX_PNG_BASE64_CHARACTERS, MAX_PNG_PIXELS } from './pngLimits';
import {
  PngDecodeDeadlineError,
  type PngDeadlineDetail,
  type PngResumeSource,
} from '../export/pngReadDiagnostic';

const WORK_SLICE_UNITS = 4096;
const MAX_SYNCHRONOUS_WORK_UNITS = WORK_SLICE_UNITS * 2;
const MAX_WORK_UNITS = MAX_PNG_BASE64_CHARACTERS * 12 + MAX_PNG_PIXELS * 32;

function milliseconds(value: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

export function createPngWork(isCurrent: () => boolean) {
  const startedAt = performance.now();
  const deadline = startedAt + PNG_TIMEOUT_MS;
  let total = 0;
  let slice = 0;
  let phase: PngDeadlineDetail['phase'] = 'opening';
  let pauseRequests = 0;
  let callbackWaitMs = 0;
  let longestCallbackWaitMs = 0;
  let continuationWaitMs = 0;
  let longestContinuationWaitMs = 0;
  const resumes: Record<PngResumeSource, number> = {
    idle: 0,
    'timer-with-idle': 0,
    'timer-without-idle': 0,
    message: 0,
    watchdog: 0,
  };
  function check(at: PngDeadlineDetail['at'] = 'check') {
    if (!isCurrent())
      throw new Error('Picture observation was cancelled. Your drawing is still here.');
    const now = performance.now();
    if (now >= deadline)
      throw new PngDecodeDeadlineError({
        phase,
        at,
        totalUnits: total,
        sliceUnits: slice,
        pauseRequests,
        idleResumes: resumes.idle,
        timerWithIdleResumes: resumes['timer-with-idle'],
        timerWithoutIdleResumes: resumes['timer-without-idle'],
        messageResumes: resumes.message,
        watchdogResumes: resumes.watchdog,
        elapsedMs: milliseconds(now - startedAt),
        callbackWaitMs: milliseconds(callbackWaitMs),
        longestCallbackWaitMs: milliseconds(longestCallbackWaitMs),
        continuationWaitMs: milliseconds(continuationWaitMs),
        longestContinuationWaitMs: milliseconds(longestContinuationWaitMs),
      });
  }
  return {
    phase(value: PngDeadlineDetail['phase']) {
      phase = value;
    },
    charge(units = 1) {
      total += units;
      slice += units;
      if (slice > MAX_SYNCHRONOUS_WORK_UNITS)
        throw new Error('Picture observation exceeded its synchronous work limit.');
      if (total > MAX_WORK_UNITS) throw new Error('Picture observation exceeded its work limit.');
      if (slice >= WORK_SLICE_UNITS) check('charge');
    },
    due: () => slice >= WORK_SLICE_UNITS,
    check,
    async pause() {
      check('before-pause');
      slice = 0;
      pauseRequests++;
      const pauseStartedAt = performance.now();
      let resumedAt = pauseStartedAt;
      await resumePngTask((source) => {
        resumedAt = performance.now();
        const waited = Math.max(0, resumedAt - pauseStartedAt);
        callbackWaitMs += waited;
        longestCallbackWaitMs = Math.max(longestCallbackWaitMs, waited);
        resumes[source]++;
        check('resume');
      }, deadline);
      const continuedAfter = Math.max(0, performance.now() - resumedAt);
      continuationWaitMs += continuedAfter;
      longestContinuationWaitMs = Math.max(longestContinuationWaitMs, continuedAfter);
      check('after-pause');
    },
  };
}
export type PngWork = ReturnType<typeof createPngWork>;
