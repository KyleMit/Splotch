import { purgeExpiredGenerationAttempts } from './generationAttemptSweep';
import { purgeExpiredGenerationJobs } from './generationJobs';
import { purgeExpiredImageReports } from './imageReportStore';
import { purgeExpiredRecordedIssues } from './recordedIssues';
import { purgeExpiredUsageRecords } from './usageRecordStorage';

const TEST_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export async function purgeTestData() {
  const results = await Promise.allSettled([
    purgeExpiredGenerationAttempts('test'),
    purgeExpiredGenerationJobs(Date.now(), 'test'),
    purgeExpiredImageReports('test'),
    purgeExpiredRecordedIssues(),
    purgeExpiredUsageRecords('test'),
  ]);
  console.log(
    '[purge-test-data]',
    results.map((result) => (result.status === 'fulfilled' ? result.value : 'failed'))
  );
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('One or more test-store retention sweeps failed');
}

export function createTestMaintenance() {
  let completedAt = -Infinity;
  let pending: Promise<void> | null = null;
  return function maintain() {
    if (pending) return pending;
    if (Date.now() - completedAt < TEST_SWEEP_INTERVAL_MS) return Promise.resolve();
    pending = purgeTestData()
      .then(() => {
        completedAt = Date.now();
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

export const maintainTestData = createTestMaintenance();
