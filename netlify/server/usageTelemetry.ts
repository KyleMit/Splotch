import { getStore } from './blobs';
import { createHmac } from 'node:crypto';
import type { StyleName } from '../../src/lib/ai/styles';
import {
  USAGE_RECORD_RETENTION_DAYS,
  type TokenUsage,
  type UsageOutcome,
} from '../../src/lib/usageRecord';
import { sleep } from './sleep';
import { loggableError } from './logRedaction';
import {
  isExpiredUsage,
  USAGE_GRANT_KEY_PREFIX,
  USAGE_STORE_NAME,
  validUsage,
} from './usageRecordStorage';

const GRANT_ID_LABEL = 'splotch-managed-usage-v1';
const HMAC_ALGORITHM = 'sha256';
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_RECORD_RETENTION_MS = USAGE_RECORD_RETENTION_DAYS * DAY_MS;
const CAS_ATTEMPTS = 3;
// A failed conditional write can reflect replica lag, so only retries pause
// before re-reading instead of immediately observing the same stale version.
const CAS_BACKOFF_MS = 50;

export function managedUsageKey(token: string, secret: string | undefined): string | null {
  if (!secret) return null;
  const grantId = createHmac(HMAC_ALGORITHM, secret)
    .update(GRANT_ID_LABEL)
    .update('\0')
    .update(token)
    .digest('hex');
  return `${USAGE_GRANT_KEY_PREFIX}${grantId}`;
}

function usageLogLine(
  credential: 'byok' | 'managed',
  style: StyleName | null,
  outcome: UsageOutcome,
  at: string
): string {
  return `[ai-usage] credential=${credential} style=${style ?? 'none'} outcome=${outcome} at=${at}`;
}

export function recordByokUsageMetric(style: StyleName | null, outcome: UsageOutcome): void {
  console.log(usageLogLine('byok', style, outcome, new Date().toISOString()));
}

/**
 * Usage tracking is best-effort and cannot fail an image request. Two devices
 * sharing a code can generate concurrently, so an unconditional read/write
 * would let both read N and write N+1, undercounting exactly the abuse this
 * tally exists to detect. Conditional writes and bounded retries serialize
 * those increments.
 *
 * The fixed deleteAfter value bounds every tally to one retention window; a
 * request at the boundary starts a fresh tally instead of extending the old
 * record.
 */
export async function recordManagedUsageMetric(
  secret: string | undefined,
  token: string,
  { style, outcome }: { style: StyleName | null; outcome: UsageOutcome }
) {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  console.log(usageLogLine('managed', style, outcome, now));

  const key = managedUsageKey(token, secret);
  if (!key) {
    console.warn('[ai-usage] USAGE_GRANT_ID_SECRET is unset; durable usage tracking is disabled');
    return;
  }

  try {
    const store = getStore({ name: USAGE_STORE_NAME, consistency: 'eventual' });
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      if (attempt > 1) await sleep(CAS_BACKOFF_MS * attempt);
      const existing = await store.getWithMetadata(key, { type: 'json' });
      const existingData = existing?.data;
      const previous =
        validUsage(existingData) && !isExpiredUsage(existingData, nowMs) ? existingData : null;
      const next: TokenUsage = {
        count: (previous?.count ?? 0) + 1,
        firstUsed: previous?.firstUsed ?? now,
        lastUsed: now,
        deleteAfter:
          previous?.deleteAfter ?? new Date(nowMs + USAGE_RECORD_RETENTION_MS).toISOString(),
        lastStyle: style,
        lastOutcome: outcome,
      };
      const condition = existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true };
      const { modified } = await store.setJSON(key, next, condition);
      if (modified) return;
    }
    console.warn(`[ai-usage] usage write conceded after ${CAS_ATTEMPTS} conflicting attempts`);
  } catch (err) {
    console.warn('[ai-usage] failed to persist usage to Netlify Blobs:', loggableError(err));
  }
}
