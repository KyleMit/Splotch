import { FREE_RESERVATION_LEASE_MS } from '$lib/ai/limits';
import {
  FREE_GENERATION_LIMIT,
  type FreeGenerationFailureKind,
  type FreeGenerationGrantAdminStats,
} from '$lib/freeGenerations';
import { isInstallationId } from '$lib/installationId';
import { loggableError } from './logRedaction';
import { sleep } from './sleep';
import {
  ADMIN_GRANT_SAMPLE_LIMIT,
  CAS_ATTEMPTS,
  CAS_BACKOFF_MS,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  dailyProviderStartKey,
  grantStore,
  memoryDailyProviderStarts,
  memoryGrants,
  normalizeDailyProviderStarts,
  normalizeGrant,
  remainingFor,
  utcDate,
  type FreeGenerationGrant,
  type GrantUpdate,
} from './freeGenerationLedger';

export {
  ADMIN_GRANT_SAMPLE_LIMIT,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
} from './freeGenerationLedger';
export {
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  settleRecoveryFreeGeneration,
} from './freeGenerationRecovery';
export type {
  RecoveryFreeGenerationOperation,
  RecoveryFreeGenerationReservationReceipt,
  RecoveryDailyFreeGenerationReceipt,
  RecoveryFreeGenerationSettlementReceipt,
  RecoveryFreeGenerationOutcome,
} from './freeGenerationRecoveryReceipts';

export async function getDailyFreeGenerationStatus(): Promise<{
  available: boolean;
  starts: number;
}> {
  const date = utcDate(new Date());
  const key = dailyProviderStartKey(date);
  const store = grantStore();
  if (!store) {
    const daily = normalizeDailyProviderStarts(memoryDailyProviderStarts.get(key), date);
    return {
      available: daily.starts < FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
      starts: daily.starts,
    };
  }
  const daily = normalizeDailyProviderStarts(await store.get(key, { type: 'json' }), date);
  return {
    available: daily.starts < FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
    starts: daily.starts,
  };
}

export async function reserveDailyFreeGeneration(): Promise<
  { reserved: true; remaining: number } | { reserved: false; remaining: 0 }
> {
  const date = utcDate(new Date());
  const key = dailyProviderStartKey(date);
  const store = grantStore();
  if (!store) {
    const daily = normalizeDailyProviderStarts(memoryDailyProviderStarts.get(key), date);
    if (daily.starts >= FREE_GENERATION_DAILY_PROVIDER_START_LIMIT) {
      return { reserved: false, remaining: 0 };
    }
    daily.starts += 1;
    memoryDailyProviderStarts.set(key, daily);
    return {
      reserved: true,
      remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - daily.starts,
    };
  }

  for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CAS_BACKOFF_MS * attempt);
    const existing = await store.getWithMetadata(key, { type: 'json' });
    const daily = normalizeDailyProviderStarts(existing?.data, date);
    if (daily.starts >= FREE_GENERATION_DAILY_PROVIDER_START_LIMIT) {
      return { reserved: false, remaining: 0 };
    }
    daily.starts += 1;
    const condition = existing?.etag
      ? { onlyIfMatch: existing.etag }
      : { onlyIfNew: true as const };
    const write = await store.setJSON(key, daily, condition);
    if (write.modified) {
      return {
        reserved: true,
        remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - daily.starts,
      };
    }
  }
  throw new Error('Daily free generation budget is busy');
}

async function updateGrant<T>(installationId: string, update: GrantUpdate<T>): Promise<T> {
  const store = grantStore();
  if (!store) {
    const now = new Date();
    const current = normalizeGrant(memoryGrants.get(installationId), now);
    const next = update(current, now);
    memoryGrants.set(installationId, next.grant);
    return next.result;
  }

  for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CAS_BACKOFF_MS * attempt);
    const existing = await store.getWithMetadata(installationId, { type: 'json' });
    const now = new Date();
    const current = normalizeGrant(existing?.data, now);
    const next = update(current, now);
    const condition = existing?.etag
      ? { onlyIfMatch: existing.etag }
      : { onlyIfNew: true as const };
    const write = await store.setJSON(installationId, next.grant, condition);
    if (write.modified) return next.result;
  }
  throw new Error('Free generation grant is busy');
}

export async function getFreeGenerationGrantStatus(
  installationId: string
): Promise<{ remaining: number }> {
  const store = grantStore();
  if (!store) {
    const grant = memoryGrants.get(installationId);
    return {
      remaining: grant ? remainingFor(normalizeGrant(grant, new Date())) : FREE_GENERATION_LIMIT,
    };
  }
  const grant = await store.get(installationId, { type: 'json' });
  return {
    remaining: grant ? remainingFor(normalizeGrant(grant, new Date())) : FREE_GENERATION_LIMIT,
  };
}

export async function reserveFreeGeneration(
  installationId: string
): Promise<{ reserved: true; reservationId: string } | { reserved: false; remaining: 0 }> {
  return updateGrant<{ reserved: true; reservationId: string } | { reserved: false; remaining: 0 }>(
    installationId,
    (grant, now) => {
      const nowIso = now.toISOString();
      grant.attempts += 1;
      grant.lastAttemptAt = nowIso;
      if (remainingFor(grant) === 0) {
        grant.failures += 1;
        grant.lastFailureAt = nowIso;
        grant.lastFailureKind = 'exhausted';
        return { grant, result: { reserved: false as const, remaining: 0 as const } };
      }
      const reservationId = crypto.randomUUID();
      grant.reservations[reservationId] = new Date(
        now.getTime() + FREE_RESERVATION_LEASE_MS
      ).toISOString();
      return { grant, result: { reserved: true as const, reservationId } };
    }
  );
}

// Holding a live reservation is what proves this completion owns a slot. A
// reclaimed lease may already have been re-reserved and spent by a later
// request, so incrementing without it would let two completions claim one slot
// and push `successful` past the limit. The lease is sized to outlive the job it
// belongs to (FREE_RESERVATION_LEASE_MS), so a missing reservation means
// something anomalous, and the caller decides what to do with the image rather
// than this ledger guessing.
export async function completeFreeGeneration(
  installationId: string,
  reservationId: string
): Promise<{ remaining: number }> {
  return updateGrant(installationId, (grant, now) => {
    if (grant.recoveryOperations[reservationId]) {
      throw new Error('Recovery free generation requires recovery settlement');
    }
    if (!grant.reservations[reservationId]) throw new Error('Free generation reservation expired');
    delete grant.reservations[reservationId];
    grant.successful += 1;
    grant.lastSuccessAt = now.toISOString();
    return { grant, result: { remaining: remainingFor(grant) } };
  });
}

export async function failFreeGeneration(
  installationId: string,
  kind: FreeGenerationFailureKind,
  reservationId?: string
): Promise<void> {
  await updateGrant(installationId, (grant, now) => {
    // A slot is released once. Two polls collecting the same refusal both
    // arrive here, and a lease that already lapsed was booked as abandoned when
    // the grant was read; neither is a second failure.
    if (reservationId && grant.recoveryOperations[reservationId]) {
      throw new Error('Recovery free generation requires recovery settlement');
    }
    if (reservationId && !grant.reservations[reservationId]) return { grant, result: undefined };
    if (reservationId) delete grant.reservations[reservationId];
    else grant.attempts += 1;
    grant.failures += 1;
    grant.lastAttemptAt = now.toISOString();
    grant.lastFailureAt = now.toISOString();
    grant.lastFailureKind = kind;
    return { grant, result: undefined };
  });
}

function statsFor(
  grants: ReadonlyArray<readonly [string, FreeGenerationGrant]>,
  persistent: boolean,
  dailyProviderStarts: number,
  grantSamplePartial: boolean
): FreeGenerationGrantAdminStats {
  const now = new Date();
  const normalized = grants.map(([id, grant]) => [id, normalizeGrant(grant, now)] as const);
  const recent = normalized
    .sort((a, b) => b[1].lastAttemptAt.localeCompare(a[1].lastAttemptAt))
    .slice(0, 20)
    .map(([id, grant]) => ({
      installation: id.slice(0, 8),
      successful: grant.successful,
      attempts: grant.attempts,
      failures: grant.failures,
      remaining: remainingFor(grant),
      lastActivityAt: grant.lastAttemptAt,
      lastFailureKind: grant.lastFailureKind,
    }));
  return {
    persistent,
    dailyProviderStarts,
    dailyProviderStartLimit: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
    sampledGrantCount: normalized.length,
    grantSampleLimit: ADMIN_GRANT_SAMPLE_LIMIT,
    grantSamplePartial,
    sampledSuccessful: normalized.reduce((sum, [, grant]) => sum + grant.successful, 0),
    sampledAttempts: normalized.reduce((sum, [, grant]) => sum + grant.attempts, 0),
    sampledFailures: normalized.reduce((sum, [, grant]) => sum + grant.failures, 0),
    sampledActiveGrants: normalized.filter(([, grant]) => grant.successful < FREE_GENERATION_LIMIT)
      .length,
    sampledExhaustedGrants: normalized.filter(
      ([, grant]) => grant.successful >= FREE_GENERATION_LIMIT
    ).length,
    sampledActiveReservations: normalized.reduce(
      (sum, [, grant]) => sum + Object.keys(grant.reservations).length,
      0
    ),
    recent,
  };
}

export async function getFreeGenerationGrantAdminStats(): Promise<FreeGenerationGrantAdminStats> {
  const store = grantStore(true);
  if (!store) {
    const date = utcDate(new Date());
    const daily = normalizeDailyProviderStarts(
      memoryDailyProviderStarts.get(dailyProviderStartKey(date)),
      date
    );
    const grants = [...memoryGrants.entries()];
    return statsFor(
      grants.slice(0, ADMIN_GRANT_SAMPLE_LIMIT),
      false,
      daily.starts,
      grants.length > ADMIN_GRANT_SAMPLE_LIMIT
    );
  }
  const keys: string[] = [];
  let grantSamplePartial = false;
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      if (!isInstallationId(blob.key)) continue;
      if (keys.length === ADMIN_GRANT_SAMPLE_LIMIT) {
        grantSamplePartial = true;
        break;
      }
      keys.push(blob.key);
    }
    if (grantSamplePartial) break;
  }
  const [daily, grants] = await Promise.all([
    getDailyFreeGenerationStatus(),
    Promise.all(
      keys.map(async (key) => {
        try {
          return [key, normalizeGrant(await store.get(key, { type: 'json' }), new Date())] as const;
        } catch (err) {
          console.warn(
            `[free-generation] failed to read grant ${key.slice(0, 8)}…:`,
            loggableError(err)
          );
          return null;
        }
      })
    ),
  ]);
  return statsFor(
    grants.filter((grant): grant is readonly [string, FreeGenerationGrant] => grant !== null),
    true,
    daily.starts,
    grantSamplePartial
  );
}
