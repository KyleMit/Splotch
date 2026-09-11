import { getStore } from '@netlify/blobs';
import { STYLE_SUFFIXES, type StyleName } from '../ai/styles';
import { USAGE_OUTCOMES, type UsageOutcome } from '../usageRecord';
import { settleWithRetentionConcurrency } from './retentionSweep';

export const USAGE_STORE_NAME = 'ai-usage';
export const USAGE_GRANT_KEY_PREFIX = 'grant-v1/';
const GRANT_KEY_PATTERN = new RegExp(`^${USAGE_GRANT_KEY_PREFIX}[0-9a-f]{64}$`);

export interface TokenUsage {
  count: number;
  firstUsed: string;
  lastUsed: string;
  deleteAfter: string;
  lastStyle: StyleName | null;
  lastOutcome: UsageOutcome;
}

function isUsageOutcome(value: unknown): value is UsageOutcome {
  return USAGE_OUTCOMES.some((outcome) => outcome === value);
}

function isStyle(value: unknown): value is StyleName | null {
  return value === null || (typeof value === 'string' && Object.hasOwn(STYLE_SUFFIXES, value));
}

export function validUsage(value: unknown): value is TokenUsage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TokenUsage>;
  return (
    typeof candidate.count === 'number' &&
    Number.isFinite(candidate.count) &&
    typeof candidate.firstUsed === 'string' &&
    typeof candidate.lastUsed === 'string' &&
    typeof candidate.deleteAfter === 'string' &&
    Number.isFinite(Date.parse(candidate.deleteAfter)) &&
    isStyle(candidate.lastStyle) &&
    isUsageOutcome(candidate.lastOutcome)
  );
}

export function isExpiredUsage(usage: TokenUsage, nowMs: number): boolean {
  return Date.parse(usage.deleteAfter) <= nowMs;
}

type UsagePurgeOutcome = 'expired' | 'legacy' | 'malformed' | 'retained';

function parseUsage(raw: string | null): unknown {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function purgeUsageRecord(
  store: ReturnType<typeof getStore>,
  key: string,
  nowMs: number
): Promise<UsagePurgeOutcome> {
  if (!GRANT_KEY_PATTERN.test(key)) {
    await store.delete(key);
    return 'legacy';
  }

  const raw = await store.get(key, { type: 'text' });
  const usage = parseUsage(raw);
  if (!validUsage(usage)) {
    await store.delete(key);
    return 'malformed';
  }
  if (isExpiredUsage(usage, nowMs)) {
    await store.delete(key);
    return 'expired';
  }
  return 'retained';
}

/** Delete expired records and legacy raw-keyed blobs from the dedicated store. */
export async function purgeExpiredUsageRecords(): Promise<{
  attemptedRecords: number;
  deletedExpiredRecords: number;
  deletedLegacyRecords: number;
  deletedMalformedRecords: number;
  failedRecords: number;
  retainedRecords: number;
}> {
  const store = getStore(USAGE_STORE_NAME);
  const nowMs = Date.now();
  let deletedExpiredRecords = 0;
  let deletedLegacyRecords = 0;
  let deletedMalformedRecords = 0;
  let failedRecords = 0;
  let retainedRecords = 0;
  let attemptedRecords = 0;

  for await (const page of store.list({ paginate: true })) {
    attemptedRecords += page.blobs.length;
    const outcomes = await settleWithRetentionConcurrency(page.blobs, ({ key }) =>
      purgeUsageRecord(store, key, nowMs)
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        console.warn(
          '[purge-usage-records] failed to process a record:',
          outcome.reason instanceof Error ? outcome.reason.message : outcome.reason
        );
        failedRecords++;
      } else if (outcome.value === 'expired') {
        deletedExpiredRecords++;
      } else if (outcome.value === 'legacy') {
        deletedLegacyRecords++;
      } else if (outcome.value === 'malformed') {
        deletedMalformedRecords++;
      } else {
        retainedRecords++;
      }
    }
  }

  return {
    attemptedRecords,
    deletedExpiredRecords,
    deletedLegacyRecords,
    deletedMalformedRecords,
    failedRecords,
    retainedRecords,
  };
}
