import { getStore } from './blobs';
import { IMAGE_REPORT_RETENTION_DAYS } from '../../src/lib/imageReport';
import { settleWithRetentionConcurrency } from './retentionSweep';

export const RECORDED_ISSUE_STORE_NAME = 'github-issues';
const DAY_MS = 24 * 60 * 60 * 1000;
export const RECORDED_ISSUE_RETENTION_MS = IMAGE_REPORT_RETENTION_DAYS * DAY_MS;
const RECORD_KEY_PATTERN = /^(\d+)-[0-9a-f-]+$/;

export async function purgeExpiredRecordedIssues() {
  const store = getStore({ name: RECORDED_ISSUE_STORE_NAME, consistency: 'strong' }, 'test');
  const cutoff = Date.now() - RECORDED_ISSUE_RETENTION_MS;
  let deleted = 0;
  let failed = 0;
  for await (const page of store.list({ paginate: true })) {
    const expired = page.blobs.filter(({ key }) => {
      const match = RECORD_KEY_PATTERN.exec(key);
      return !match || Number(match[1]) <= cutoff;
    });
    const outcomes = await settleWithRetentionConcurrency(expired, ({ key }) => store.delete(key));
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') deleted++;
      else failed++;
    }
  }
  if (failed) throw new Error('Recorded issue retention could not delete every expired record');
  return { deleted };
}
