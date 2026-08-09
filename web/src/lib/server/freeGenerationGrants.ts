import { getStore } from '@netlify/blobs';
import {
  FREE_GENERATION_LIMIT,
  type FreeGenerationFailureKind,
  type FreeGenerationGrantAdminStats,
} from '$lib/freeGenerations';

const STORE_NAME = 'free-generation-grants';
const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/;
const RESERVATION_LEASE_MS = 60_000;
const CAS_ATTEMPTS = 12;
const CAS_BACKOFF_MS = 20;

interface FreeGenerationGrant {
  version: 1;
  successful: number;
  attempts: number;
  failures: number;
  createdAt: string;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureKind: FreeGenerationFailureKind | null;
  reservations: Record<string, string>;
}

type GrantUpdate<T> = (
  grant: FreeGenerationGrant,
  now: Date
) => { grant: FreeGenerationGrant; result: T };

const memoryGrants = new Map<string, FreeGenerationGrant>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isInstallationId(value: string | null): value is string {
  return typeof value === 'string' && INSTALLATION_ID_PATTERN.test(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const FAILURE_KINDS = new Set<FreeGenerationFailureKind>([
  'abandoned',
  'exhausted',
  'invalid-request',
  'safety',
  'upstream',
]);

function failureKindOrNull(value: unknown): FreeGenerationFailureKind | null {
  return typeof value === 'string' && FAILURE_KINDS.has(value as FreeGenerationFailureKind)
    ? (value as FreeGenerationFailureKind)
    : null;
}

function normalizeGrant(value: unknown, now: Date): FreeGenerationGrant {
  const source =
    typeof value === 'object' && value !== null ? (value as Partial<FreeGenerationGrant>) : {};
  const nowIso = now.toISOString();
  const reservations: Record<string, string> = {};
  let abandoned = 0;
  if (source.reservations && typeof source.reservations === 'object') {
    for (const [id, expiresAt] of Object.entries(source.reservations)) {
      if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > now.getTime()) {
        reservations[id] = expiresAt;
      } else {
        abandoned += 1;
      }
    }
  }
  const failures = nonNegativeInteger(source.failures) + abandoned;
  return {
    version: 1,
    successful: Math.min(FREE_GENERATION_LIMIT, nonNegativeInteger(source.successful)),
    attempts: nonNegativeInteger(source.attempts),
    failures,
    createdAt: stringOrNull(source.createdAt) ?? nowIso,
    lastAttemptAt: stringOrNull(source.lastAttemptAt) ?? nowIso,
    lastSuccessAt: stringOrNull(source.lastSuccessAt),
    lastFailureAt: abandoned > 0 ? nowIso : stringOrNull(source.lastFailureAt),
    lastFailureKind: abandoned > 0 ? 'abandoned' : failureKindOrNull(source.lastFailureKind),
    reservations,
  };
}

function remainingFor(grant: FreeGenerationGrant): number {
  return Math.max(
    0,
    FREE_GENERATION_LIMIT - grant.successful - Object.keys(grant.reservations).length
  );
}

async function updateGrant<T>(installationId: string, update: GrantUpdate<T>): Promise<T> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch {
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
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch {
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
        now.getTime() + RESERVATION_LEASE_MS
      ).toISOString();
      return { grant, result: { reserved: true as const, reservationId } };
    }
  );
}

export async function completeFreeGeneration(
  installationId: string,
  reservationId: string
): Promise<{ remaining: number }> {
  return updateGrant(installationId, (grant, now) => {
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
  persistent: boolean
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
    totalSuccessful: normalized.reduce((sum, [, grant]) => sum + grant.successful, 0),
    totalAttempts: normalized.reduce((sum, [, grant]) => sum + grant.attempts, 0),
    totalFailures: normalized.reduce((sum, [, grant]) => sum + grant.failures, 0),
    activeGrants: normalized.filter(([, grant]) => grant.successful < FREE_GENERATION_LIMIT).length,
    exhaustedGrants: normalized.filter(([, grant]) => grant.successful >= FREE_GENERATION_LIMIT)
      .length,
    activeReservations: normalized.reduce(
      (sum, [, grant]) => sum + Object.keys(grant.reservations).length,
      0
    ),
    recent,
  };
}

export async function getFreeGenerationGrantAdminStats(): Promise<FreeGenerationGrantAdminStats> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch {
    return statsFor([...memoryGrants.entries()], false);
  }
  const keys: string[] = [];
  for await (const page of store.list({ paginate: true })) {
    keys.push(...page.blobs.map((blob) => blob.key).filter((key) => isInstallationId(key)));
  }
  const grants = (
    await Promise.all(
      keys.map(async (key) => {
        try {
          return [key, normalizeGrant(await store.get(key, { type: 'json' }), new Date())] as const;
        } catch (err) {
          console.warn(
            `[free-generation] failed to read grant ${key.slice(0, 8)}…:`,
            err instanceof Error ? err.message : err
          );
          return null;
        }
      })
    )
  ).filter((grant): grant is readonly [string, FreeGenerationGrant] => grant !== null);
  return statsFor(grants, true);
}
