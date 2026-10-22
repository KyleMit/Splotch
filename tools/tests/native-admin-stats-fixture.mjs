import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// GET /api/admin/stats answers for the admin console's suites, in the shape the endpoint sends
// (netlify/server/api/adminStats.ts, AdminStatsSnapshot): one code with a tally from two days
// ago, one never used, and one sampled grant.

const DAY_MS = 86_400_000;

export const USED = {
  count: 3,
  firstUsed: '2026-10-01T09:00:00.000Z',
  lastUsed: new Date(Date.now() - 2 * DAY_MS).toISOString(),
  deleteAfter: '2026-10-31T09:00:00.000Z',
  lastStyle: 'Crayon',
  lastOutcome: 'succeeded',
};

export const GRANTS = {
  persistent: true,
  dailyProviderStarts: 4,
  dailyProviderStartLimit: 500,
  sampledGrantCount: 1,
  grantSampleLimit: 200,
  grantSamplePartial: false,
  sampledSuccessful: 2,
  sampledAttempts: 3,
  sampledFailures: 1,
  sampledActiveGrants: 1,
  sampledExhaustedGrants: 0,
  sampledActiveReservations: 0,
  recent: [
    {
      installation: 'cccccccc',
      successful: 2,
      attempts: 3,
      failures: 1,
      remaining: 8,
      lastActivityAt: '2026-10-02T09:00:00.000Z',
      lastFailureKind: 'safety',
    },
  ],
};

export const STATS = {
  ok: true,
  usageAvailable: true,
  codes: [
    { token: 'alpha', usage: USED },
    { token: 'beta', usage: null },
  ],
  freeGrantStats: GRANTS,
};

// What the /api function itself answered the wire corpus's stats read (no Blobs, no usage
// secret), recorded by tools/api-smoke/tests/wire-diff.test.mjs.
export const RECORDED_STATS = JSON.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', 'api-smoke', 'fixtures', 'wire-additions.json'),
      'utf8'
    )
  )['stats, read'].body
);
