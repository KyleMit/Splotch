import { FREE_RESERVATION_LEASE_MS } from '../ai/limits';
import { FREE_GENERATION_LIMIT, type FreeGenerationFailureKind } from '../freeGenerations';
import { FREE_GENERATION_DAILY_PROVIDER_START_LIMIT } from './freeGenerationLedgerPolicy';

export const RECOVERY_GRANT_RECEIPT_LIMIT = 64;
export const RECOVERY_DAILY_RECEIPT_LIMIT = 1024;
const RECOVERY_RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface RecoveryFreeGenerationOperation {
  operationId: string;
  admittedAt: string;
}

export interface RecoveryOperationTiming extends RecoveryFreeGenerationOperation {
  expiresAt: string;
  dailyDate: string;
  retainUntil: string;
}

export type RecoveryFreeGenerationReservationReceipt = RecoveryOperationTiming &
  (
    | { reserved: true; reservationId: string; remaining: number }
    | { reserved: false; reason: 'exhausted'; remaining: 0 }
  );

export type RecoveryDailyFreeGenerationReceipt = RecoveryOperationTiming & {
  installationId: string;
} & (
    | { reserved: true; remaining: number }
    | { reserved: false; reason: 'daily-limit' | 'day-ended' | 'expired'; remaining: number }
  );

export type RecoveryFreeGenerationOutcome =
  { kind: 'success' } | { kind: 'failure'; failureKind: FreeGenerationFailureKind };

export type RecoveryFreeGenerationSettlementReceipt = RecoveryOperationTiming & {
  outcome: RecoveryFreeGenerationOutcome;
  settledAt: string;
  remaining: number;
};

export interface RecoveryGrantOperation {
  reservation: RecoveryFreeGenerationReservationReceipt;
  settlement: RecoveryFreeGenerationSettlementReceipt | null;
}

function isRecoveryOperationId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function recoveryOperationTiming(
  operation: RecoveryFreeGenerationOperation
): RecoveryOperationTiming {
  if (!isRecoveryOperationId(operation.operationId) || !isIsoTimestamp(operation.admittedAt)) {
    throw new Error('Invalid recovery free generation operation');
  }
  const expiresAt = new Date(new Date(operation.admittedAt).getTime() + FREE_RESERVATION_LEASE_MS);
  return {
    operationId: operation.operationId,
    admittedAt: operation.admittedAt,
    expiresAt: expiresAt.toISOString(),
    dailyDate: operation.admittedAt.slice(0, 10),
    retainUntil: new Date(expiresAt.getTime() + RECOVERY_RECEIPT_RETENTION_MS).toISOString(),
  };
}

export function assertRecoveryTiming(
  receipt: RecoveryOperationTiming,
  operation: RecoveryFreeGenerationOperation
): void {
  const expected = recoveryOperationTiming(operation);
  if (
    receipt.operationId !== expected.operationId ||
    receipt.admittedAt !== expected.admittedAt ||
    receipt.expiresAt !== expected.expiresAt ||
    receipt.dailyDate !== expected.dailyDate ||
    receipt.retainUntil !== expected.retainUntil
  ) {
    throw new Error('Recovery free generation operation conflicts with its admission');
  }
}

const FAILURE_KINDS: readonly FreeGenerationFailureKind[] = [
  'abandoned',
  'daily-limit',
  'exhausted',
  'invalid-request',
  'safety',
  'upstream',
];

export function isFailureKind(value: unknown): value is FreeGenerationFailureKind {
  return FAILURE_KINDS.some((kind) => kind === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRemaining(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

const TIMING_KEYS = ['operationId', 'admittedAt', 'expiresAt', 'dailyDate', 'retainUntil'];
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function isTiming(value: unknown): value is RecoveryOperationTiming {
  if (
    !isRecord(value) ||
    !isRecoveryOperationId(value.operationId) ||
    !isIsoTimestamp(value.admittedAt)
  ) {
    return false;
  }
  const expected = recoveryOperationTiming({
    operationId: value.operationId,
    admittedAt: value.admittedAt,
  });
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function isReservation(value: unknown): value is RecoveryFreeGenerationReservationReceipt {
  if (!isTiming(value) || !isRecord(value)) return false;
  if (value.reserved === true) {
    return (
      hasExactKeys(value, [...TIMING_KEYS, 'reserved', 'reservationId', 'remaining']) &&
      value.reservationId === value.operationId &&
      isRemaining(value.remaining, FREE_GENERATION_LIMIT - 1)
    );
  }
  return (
    value.reserved === false &&
    value.reason === 'exhausted' &&
    value.remaining === 0 &&
    hasExactKeys(value, [...TIMING_KEYS, 'reserved', 'reason', 'remaining'])
  );
}

export function isRecoveryFreeGenerationOutcome(
  value: unknown
): value is RecoveryFreeGenerationOutcome {
  if (!isRecord(value)) return false;
  if (value.kind === 'success') return hasExactKeys(value, ['kind']);
  return (
    value.kind === 'failure' &&
    isFailureKind(value.failureKind) &&
    hasExactKeys(value, ['kind', 'failureKind'])
  );
}

function isSettlement(value: unknown): value is RecoveryFreeGenerationSettlementReceipt {
  if (
    !isTiming(value) ||
    !isRecord(value) ||
    !isRecoveryFreeGenerationOutcome(value.outcome) ||
    !isIsoTimestamp(value.settledAt) ||
    !isRemaining(value.remaining, FREE_GENERATION_LIMIT) ||
    !hasExactKeys(value, [...TIMING_KEYS, 'outcome', 'settledAt', 'remaining'])
  )
    return false;
  const settledAt = new Date(value.settledAt).getTime();
  if (
    settledAt < new Date(value.admittedAt).getTime() ||
    settledAt > new Date(value.retainUntil).getTime()
  )
    return false;
  return (
    value.outcome.kind !== 'failure' ||
    value.outcome.failureKind !== 'abandoned' ||
    value.settledAt === value.expiresAt
  );
}

function isGrantOperation(value: unknown): value is RecoveryGrantOperation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['reservation', 'settlement']) ||
    !isReservation(value.reservation)
  )
    return false;
  if (value.settlement === null) return true;
  if (!isSettlement(value.settlement) || !value.reservation.reserved) return false;
  assertRecoveryTiming(value.settlement, value.reservation);
  return true;
}

function isDailyReceipt(value: unknown): value is RecoveryDailyFreeGenerationReceipt {
  if (
    !isTiming(value) ||
    !isRecord(value) ||
    !isRecoveryOperationId(value.installationId) ||
    !isRemaining(value.remaining, FREE_GENERATION_DAILY_PROVIDER_START_LIMIT)
  )
    return false;
  if (value.reserved === true) {
    return (
      value.remaining < FREE_GENERATION_DAILY_PROVIDER_START_LIMIT &&
      hasExactKeys(value, [...TIMING_KEYS, 'installationId', 'reserved', 'remaining'])
    );
  }
  if (
    value.reserved !== false ||
    !hasExactKeys(value, [...TIMING_KEYS, 'installationId', 'reserved', 'reason', 'remaining'])
  )
    return false;
  if (value.reason === 'daily-limit') return value.remaining === 0;
  return value.reason === 'day-ended' || value.reason === 'expired';
}

function normalizeReceipts<T>(
  value: unknown,
  guard: (entry: unknown) => entry is T,
  operationId: (entry: T) => string,
  limit: number
): Record<string, T> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > limit) {
    throw new Error('Invalid recovery free generation receipts');
  }
  const result: Record<string, T> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!guard(entry) || operationId(entry) !== id) {
      throw new Error('Invalid recovery free generation receipt');
    }
    result[id] = structuredClone(entry);
  }
  return result;
}

export function normalizeRecoveryGrantOperations(
  value: unknown
): Record<string, RecoveryGrantOperation> {
  return normalizeReceipts(
    value,
    isGrantOperation,
    (entry) => entry.reservation.operationId,
    RECOVERY_GRANT_RECEIPT_LIMIT
  );
}

export function normalizeRecoveryDailyReceipts(
  value: unknown
): Record<string, RecoveryDailyFreeGenerationReceipt> {
  return normalizeReceipts(
    value,
    isDailyReceipt,
    (entry) => entry.operationId,
    RECOVERY_DAILY_RECEIPT_LIMIT
  );
}

export function pruneRecoveryReceipts<T>(
  receipts: Record<string, T>,
  retainUntil: (receipt: T) => string,
  now: Date
): void {
  for (const [id, receipt] of Object.entries(receipts)) {
    if (new Date(retainUntil(receipt)).getTime() <= now.getTime()) delete receipts[id];
  }
}
