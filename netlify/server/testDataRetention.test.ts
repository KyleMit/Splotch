// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const sweeps = vi.hoisted(() => [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()]);
vi.mock('./generationAttemptSweep', () => ({ purgeExpiredGenerationAttempts: sweeps[0] }));
vi.mock('./generationJobs', () => ({ purgeExpiredGenerationJobs: sweeps[1] }));
vi.mock('./imageReportStore', () => ({ purgeExpiredImageReports: sweeps[2] }));
vi.mock('./recordedIssues', () => ({ purgeExpiredRecordedIssues: sweeps[3] }));
vi.mock('./usageRecordStorage', () => ({ purgeExpiredUsageRecords: sweeps[4] }));
import { createTestMaintenance, purgeTestData } from './testDataRetention';

const HOUR_MS = 60 * 60 * 1000;
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('coalesces provider activity and repeats cleanup after the successful sweep interval', async () => {
  vi.useFakeTimers();
  const maintain = createTestMaintenance();
  const first = maintain();
  expect(maintain()).toBe(first);
  await first;
  await maintain();
  expect(sweeps[0]).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(HOUR_MS);
  await maintain();
  expect(sweeps[0]).toHaveBeenCalledTimes(2);
  expect(sweeps[0]).toHaveBeenCalledWith('test');
  expect(sweeps[1]).toHaveBeenCalledWith(expect.any(Number), 'test');
});

it('waits for every sweep and retries after a failure instead of caching it', async () => {
  const maintain = createTestMaintenance();
  sweeps[0].mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(maintain()).rejects.toThrow('retention sweeps failed');
  expect(sweeps.every((sweep) => sweep.mock.calls.length === 1)).toBe(true);
  await expect(maintain()).resolves.toBeUndefined();
  expect(sweeps.every((sweep) => sweep.mock.calls.length === 2)).toBe(true);
  await expect(purgeTestData()).resolves.toBeUndefined();
});
