import { randomUUID } from 'node:crypto';
import { getStore } from './blobs';
import type { CreateIssueInput } from './github';

export const isReportingConfigured = () => true;

export async function createIssue(input: CreateIssueInput): Promise<void> {
  await getStore({ name: 'github-issues', consistency: 'strong' }).setJSON(randomUUID(), {
    ...input,
    recordedAt: new Date().toISOString(),
  });
}
