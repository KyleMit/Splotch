import { getStore } from '@netlify/blobs';
import { STYLE_SUFFIXES, type StyleName } from '../ai/styles';
import { USAGE_OUTCOMES, type UsageOutcome } from '../usageRecord';

export const USAGE_STORE_NAME = 'ai-usage';
export const USAGE_GRANT_KEY_PREFIX = 'grant-v1/';
const GRANT_KEY_PATTERN = /^grant-v1\/[0-9a-f]{64}$/;

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

/** Delete expired records and legacy raw-keyed blobs from the dedicated store. */
export async function purgeExpiredUsageRecords(): Promise<{
  deletedRecords: number;
  retainedRecords: number;
}> {
  const store = getStore(USAGE_STORE_NAME);
  const nowMs = Date.now();
  let deletedRecords = 0;
  let retainedRecords = 0;

  for await (const page of store.list({ paginate: true })) {
    for (const { key } of page.blobs) {
      if (!GRANT_KEY_PATTERN.test(key)) {
        await store.delete(key);
        deletedRecords++;
        continue;
      }

      const raw = await store.get(key, { type: 'text' });
      const usage: unknown = (() => {
        try {
          return typeof raw === 'string' ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
      if (!validUsage(usage) || isExpiredUsage(usage, nowMs)) {
        await store.delete(key);
        deletedRecords++;
      } else {
        retainedRecords++;
      }
    }
  }

  return { deletedRecords, retainedRecords };
}
