import { randomUUID } from 'node:crypto';
import { getStore } from './blobs';
import type { CreateIssueInput } from './github';
import { RECORDED_ISSUE_STORE_NAME } from './recordedIssues';
import { maintainTestData } from './testDataRetention';

export const isReportingConfigured = () => true;

export async function createIssue(input: CreateIssueInput): Promise<void> {
  await maintainTestData();
  const now = Date.now();
  await getStore({ name: RECORDED_ISSUE_STORE_NAME, consistency: 'strong' }).setJSON(
    `${now}-${randomUUID()}`,
    {
      ...input,
      recordedAt: new Date(now).toISOString(),
    }
  );
}
