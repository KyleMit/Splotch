import { env } from './privateEnv';
import { getStore } from './blobs';
import type { StyleName } from '../../src/lib/ai/styles';
import type { TokenUsage, UsageOutcome } from '../../src/lib/usageRecord';
import { isExpiredUsage, USAGE_STORE_NAME, validUsage } from './usageRecordStorage';
import { managedUsageKey, recordByokUsageMetric, recordManagedUsageMetric } from './usageTelemetry';

function usageGrantKey(token: string): string | null {
  return managedUsageKey(token, env.USAGE_GRANT_ID_SECRET);
}
export function recordByokUsage(style: StyleName | null, outcome: UsageOutcome): void {
  recordByokUsageMetric(style, outcome);
}
export function recordTokenUsage(
  token: string,
  input: { style: StyleName | null; outcome: UsageOutcome }
): Promise<void> {
  return recordManagedUsageMetric(env.USAGE_GRANT_ID_SECRET, token, input);
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
    await getStore({ name: USAGE_STORE_NAME, consistency: 'eventual' }).delete(key);
  } catch (err) {
    console.warn('[ai-usage] failed to delete usage:', err instanceof Error ? err.message : err);
  }
}

/**
 * Read the usage tally for each token, as a map keyed by token, deleting each
 * expired record it meets instead of leaving it for the daily purge
 * (purgeExpiredUsageRecords). Tokens with no recorded usage are omitted (so the
 * caller can distinguish "never used" from a Blobs outage). Eventual reads are
 * sufficient: a slightly stale count is fine here, and no request reads its own
 * write (ADR-0025). A null result means the whole snapshot is unavailable; one
 * token's read or expiry-delete failure is isolated from the other tokens.
 */
export async function readUsageAndPurgeExpired(
  tokens: string[]
): Promise<Record<string, TokenUsage> | null> {
  const keyedTokens = tokens.flatMap((token) => {
    const key = usageGrantKey(token);
    return key === null ? [] : [{ token, key }];
  });
  if (keyedTokens.length !== tokens.length) {
    console.warn('[ai-usage] USAGE_GRANT_ID_SECRET is unset; no usage stats are available');
    return null;
  }

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore({ name: USAGE_STORE_NAME, consistency: 'eventual' });
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
        const usage = await store.get(key, { type: 'json' });
        if (!validUsage(usage)) return null;
        if (isExpiredUsage(usage, Date.now())) {
          await store.delete(key);
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
