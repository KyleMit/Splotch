import { json } from '@sveltejs/kit';
import { getFreeGenerationGrantAdminStats } from '../freeGenerationGrants';
import { apiHandler } from '../http';
import { loggableError } from '../logRedaction';
import { getTokensStatus } from '../tokens';
import { readUsageAndPurgeExpired } from '../usage';
import type { FreeGenerationGrantAdminStats } from '../../freeGenerations';
import type { TokenUsage } from '../../usageRecord';
import type { ApiHandler } from './apiEvent';
import { requireSession } from './adminTokens';

// The /admin console's usage tallies and free-grant figures over the bearer session, the data the
// server-rendered console's loader reads directly (web/src/routes/admin/+page.server.ts). It is a
// sibling of /api/admin/tokens rather than more fields on that snapshot, so the tokens contract
// installed clients already read stays byte-for-byte what it was, and a slow or failing tally read
// never holds up the code list.

/** One listed code and its generation tally; `usage` is null for a code never used. */
export type AdminCodeUsage = { token: string; usage: TokenUsage | null };

export type AdminStatsSnapshot = {
  ok: true;
  // false: the tally store is unreachable or USAGE_GRANT_ID_SECRET is unset, so every `usage` is
  // null for that reason rather than because the code was never used.
  usageAvailable: boolean;
  codes: AdminCodeUsage[];
  // null: the grant store could not be read; the tallies above are unaffected.
  freeGrantStats: FreeGenerationGrantAdminStats | null;
};

async function readFreeGrantStats(): Promise<FreeGenerationGrantAdminStats | null> {
  try {
    return await getFreeGenerationGrantAdminStats();
  } catch (err) {
    console.warn('[free-generation] admin stats unavailable:', loggableError(err));
    return null;
  }
}

/** Each listed code's generation tally, plus the free-generation grant figures. */
export const GET: ApiHandler = apiHandler(async ({ request }) => {
  requireSession(request);
  const { tokens } = await getTokensStatus();
  const [usage, freeGrantStats] = await Promise.all([
    readUsageAndPurgeExpired(tokens),
    readFreeGrantStats(),
  ]);
  const codes = tokens.map((token) => ({
    token,
    usage: usage && Object.hasOwn(usage, token) ? usage[token] : null,
  }));
  const payload = {
    ok: true,
    usageAvailable: usage !== null,
    codes,
    freeGrantStats,
  } satisfies AdminStatsSnapshot;
  return json(payload);
});
