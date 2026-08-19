import { env } from '$env/dynamic/private';
import { getStore } from '@netlify/blobs';
import { createHmac } from 'node:crypto';
import type { StyleName } from '../ai/styles';
import { USAGE_RECORD_RETENTION_DAYS, type UsageOutcome } from '../usageRecord';
import {
  isExpiredUsage,
  USAGE_GRANT_KEY_PREFIX,
  USAGE_STORE_NAME,
  validUsage,
  type TokenUsage,
} from './usageRecordStorage';

export type { TokenUsage };

const GRANT_ID_LABEL = 'splotch-managed-usage-v1';
const HMAC_ALGORITHM = 'sha256';
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_RECORD_RETENTION_MS = USAGE_RECORD_RETENTION_DAYS * DAY_MS;
const CAS_ATTEMPTS = 3;
// A failed conditional write can reflect replica lag, so only retries pause
// before re-reading instead of immediately observing the same stale version.
const CAS_BACKOFF_MS = 50;

function usageGrantKey(token: string): string | null {
  const secret = env.USAGE_GRANT_ID_SECRET;
  if (!secret) return null;
  const grantId = createHmac(HMAC_ALGORITHM, secret)
    .update(GRANT_ID_LABEL)
    .update('\0')
    .update(token)
    .digest('hex');
  return `${USAGE_GRANT_KEY_PREFIX}${grantId}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function usageLogLine(
  credential: 'byok' | 'managed',
  style: StyleName | null,
  outcome: UsageOutcome,
  at: string
): string {
  return `[ai-usage] credential=${credential} style=${style ?? 'none'} outcome=${outcome} at=${at}`;
}

export function recordByokUsage(style: StyleName | null, outcome: UsageOutcome): void {
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
export async function recordTokenUsage(
  token: string,
  { style, outcome }: { style: StyleName | null; outcome: UsageOutcome }
) {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  console.log(usageLogLine('managed', style, outcome, now));

  const key = usageGrantKey(token);
  if (!key) {
    console.warn('[ai-usage] USAGE_GRANT_ID_SECRET is unset; durable usage tracking is disabled');
    return;
  }

  try {
    const store = getStore(USAGE_STORE_NAME);
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
    console.warn(
      '[ai-usage] failed to persist usage to Netlify Blobs:',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Revocation cleanup is best-effort so a Blobs failure cannot undo the token
 * removal. Any record missed here remains bounded by its fixed deleteAfter and
 * the daily purge.
 */
export async function deleteUsage(token: string) {
  const key = usageGrantKey(token);
  if (!key) {
    console.warn('[ai-usage] USAGE_GRANT_ID_SECRET is unset; could not delete the usage record');
    return;
  }
  try {
    await getStore(USAGE_STORE_NAME).delete(key);
  } catch (err) {
    console.warn('[ai-usage] failed to delete usage:', err instanceof Error ? err.message : err);
  }
}

/**
 * Read the usage tally for each token, as a map keyed by token. Tokens with no
 * recorded usage are omitted (so the caller can distinguish "never used" from a
 * Blobs outage). Eventual consistency (the default) is sufficient — slightly-stale
 * counts are fine here, and it sidesteps the strong-read context requirements
 * entirely (ADR-0025). A null result means the whole snapshot is unavailable;
 * one token's read or expiry-delete failure is isolated from the other tokens.
 */
export async function getUsage(tokens: string[]): Promise<Record<string, TokenUsage> | null> {
  const keyedTokens = tokens.map((token) => ({ token, key: usageGrantKey(token) }));
  if (keyedTokens.some(({ key }) => key === null)) {
    console.warn('[ai-usage] USAGE_GRANT_ID_SECRET is unset; no usage stats are available');
    return null;
  }

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(USAGE_STORE_NAME);
  } catch (err) {
    console.warn(
      '[ai-usage] Netlify Blobs unavailable, no usage stats:',
      err instanceof Error ? err.message : err
    );
    return null;
  }

  const entries = await Promise.all(
    keyedTokens.map(async ({ token, key }) => {
      try {
        const usage = await store.get(key!, { type: 'json' });
        if (!validUsage(usage)) return null;
        if (isExpiredUsage(usage, Date.now())) {
          await store.delete(key!);
          return null;
        }
        return [token, usage] as const;
      } catch (err) {
        console.warn(
          `[ai-usage] failed to read usage for a token:`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    })
  );

  const map: Record<string, TokenUsage> = {};
  for (const entry of entries) {
    if (entry) map[entry[0]] = entry[1];
  }
  return map;
}
