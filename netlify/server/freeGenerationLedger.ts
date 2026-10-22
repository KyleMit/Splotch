import { getStore } from '@netlify/blobs';
import { dev } from './runtimeMode';
import {
  FREE_GENERATION_LIMIT,
  type FreeGenerationFailureKind,
} from '../../src/lib/freeGenerations';
import {
  isFailureKind,
  normalizeRecoveryGrantOperations,
  normalizeRecoveryDailyReceipts,
  pruneRecoveryReceipts,
  type RecoveryGrantOperation,
  type RecoveryDailyFreeGenerationReceipt,
} from './freeGenerationRecoveryReceipts';

import { FREE_GENERATION_STORE_NAME } from './freeGenerationLedgerPolicy';
export {
  FREE_GENERATION_STORE_NAME,
  CAS_ATTEMPTS,
  CAS_BACKOFF_MS,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  ADMIN_GRANT_SAMPLE_LIMIT,
} from './freeGenerationLedgerPolicy';

const DAILY_PROVIDER_START_KEY_PREFIX = 'daily-provider-starts/';

export interface FreeGenerationGrant {
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
  recoveryOperations: Record<string, RecoveryGrantOperation>;
}

export interface DailyProviderStarts {
  version: 1;
  date: string;
  starts: number;
  recoveryStarts: Record<string, RecoveryDailyFreeGenerationReceipt>;
}

export type GrantUpdate<T> = (
  grant: FreeGenerationGrant,
  now: Date
) => { grant: FreeGenerationGrant; result: T };

export const memoryGrants = new Map<string, FreeGenerationGrant>();
export const memoryDailyProviderStarts = new Map<string, DailyProviderStarts>();

// Netlify Blobs reads are eventually consistent by default: after a write, an
// edge node can keep serving the previous copy for up to a minute. Every
// operation in this module is a read-modify-write against one key, and a single
// generation does two of them around a multi-second model call — reserve a slot,
// then finalize it. Under the default mode that second read routinely missed the
// reservation the same request had just written, so roughly half of all
// production free generations answered 503 with a finished image in hand. Strong
// reads bypass the cache; the added latency is noise beside the provider call.
export function grantStore(allowMemoryFallback = false): ReturnType<typeof getStore> | null {
  try {
    return getStore({ name: FREE_GENERATION_STORE_NAME, consistency: 'strong' });
  } catch (error) {
    if (!dev && !allowMemoryFallback) throw error;
    return null;
  }
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function failureKindOrNull(value: unknown): FreeGenerationFailureKind | null {
  return isFailureKind(value) ? value : null;
}

export function readGrantRecord(value: unknown, now: Date): FreeGenerationGrant {
  const source =
    typeof value === 'object' && value !== null ? (value as Partial<FreeGenerationGrant>) : {};
  const nowIso = now.toISOString();
  const reservations: Record<string, string> = {};
  if (source.reservations && typeof source.reservations === 'object') {
    for (const [id, expiresAt] of Object.entries(source.reservations)) {
      reservations[id] = typeof expiresAt === 'string' ? expiresAt : '';
    }
  }
  const recoveryOperations = normalizeRecoveryGrantOperations(source.recoveryOperations);
  for (const [id, operation] of Object.entries(recoveryOperations)) {
    const expected =
      operation.reservation.reserved && !operation.settlement
        ? operation.reservation.expiresAt
        : undefined;
    if (reservations[id] !== expected) {
      throw new Error('Recovery free generation reservation disagrees with its receipt');
    }
  }
  const operations = Object.values(recoveryOperations);
  const recoverySuccesses = operations.filter(
    (entry) => entry.settlement?.outcome.kind === 'success'
  ).length;
  const recoveryFailures = operations.filter(
    (entry) => !entry.reservation.reserved || entry.settlement?.outcome.kind === 'failure'
  ).length;
  if (
    operations.length > nonNegativeInteger(source.attempts) ||
    recoverySuccesses > nonNegativeInteger(source.successful) ||
    recoveryFailures > nonNegativeInteger(source.failures)
  ) {
    throw new Error('Recovery free generation receipts disagree with their counters');
  }
  return {
    version: 1,
    successful: Math.min(FREE_GENERATION_LIMIT, nonNegativeInteger(source.successful)),
    attempts: nonNegativeInteger(source.attempts),
    failures: nonNegativeInteger(source.failures),
    createdAt: stringOrNull(source.createdAt) ?? nowIso,
    lastAttemptAt: stringOrNull(source.lastAttemptAt) ?? nowIso,
    lastSuccessAt: stringOrNull(source.lastSuccessAt),
    lastFailureAt: stringOrNull(source.lastFailureAt),
    lastFailureKind: failureKindOrNull(source.lastFailureKind),
    reservations,
    recoveryOperations,
  };
}

export function reclaimExpiredReservations(grant: FreeGenerationGrant, now: Date): void {
  const abandoned: RecoveryGrantOperation[] = [];
  for (const [id, expiresAt] of Object.entries(grant.reservations)) {
    if (new Date(expiresAt).getTime() > now.getTime()) continue;
    delete grant.reservations[id];
    grant.failures += 1;
    grant.lastFailureAt = now.toISOString();
    grant.lastFailureKind = 'abandoned';
    const operation = grant.recoveryOperations[id];
    if (operation) abandoned.push(operation);
  }
  for (const operation of abandoned) {
    if (operation.settlement) throw new Error('Settled recovery operation holds a reservation');
    const { reservation } = operation;
    operation.settlement = {
      operationId: reservation.operationId,
      admittedAt: reservation.admittedAt,
      expiresAt: reservation.expiresAt,
      dailyDate: reservation.dailyDate,
      retainUntil: reservation.retainUntil,
      outcome: { kind: 'failure', failureKind: 'abandoned' },
      settledAt: reservation.expiresAt,
      remaining: remainingFor(grant),
    };
  }
  pruneRecoveryReceipts(grant.recoveryOperations, (entry) => entry.reservation.retainUntil, now);
}

export function normalizeGrant(value: unknown, now: Date): FreeGenerationGrant {
  const grant = readGrantRecord(value, now);
  reclaimExpiredReservations(grant, now);
  return grant;
}

export function remainingFor(grant: FreeGenerationGrant): number {
  return Math.max(
    0,
    FREE_GENERATION_LIMIT - grant.successful - Object.keys(grant.reservations).length
  );
}

export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function dailyProviderStartKey(date: string): string {
  return `${DAILY_PROVIDER_START_KEY_PREFIX}${date}`;
}

export function normalizeDailyProviderStarts(value: unknown, date: string): DailyProviderStarts {
  const source =
    typeof value === 'object' && value !== null ? (value as Partial<DailyProviderStarts>) : {};
  const recoveryStarts = normalizeRecoveryDailyReceipts(source.recoveryStarts);
  if (
    Object.values(recoveryStarts).some((receipt) => receipt.dailyDate !== date) ||
    (Object.keys(recoveryStarts).length > 0 && source.date !== date)
  ) {
    throw new Error('Recovery daily free generation receipts disagree with their date');
  }
  const starts = source.date === date ? nonNegativeInteger(source.starts) : 0;
  if (Object.values(recoveryStarts).filter((receipt) => receipt.reserved).length > starts) {
    throw new Error('Recovery daily free generation receipts disagree with their counter');
  }
  return {
    version: 1,
    date,
    starts,
    recoveryStarts,
  };
}
