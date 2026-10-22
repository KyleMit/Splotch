// Every deployment that can write these shared records must preserve recovery
// receipts before recovery is activated; an older normalizer can erase them by CAS.
import {
  FREE_GENERATION_LIMIT,
  type FreeGenerationFailureKind,
} from '../../src/lib/freeGenerations';
import { isInstallationId } from '../../src/lib/installationId';
import {
  dailyProviderStartKey,
  FREE_GENERATION_DAILY_PROVIDER_START_LIMIT,
  normalizeDailyProviderStarts,
  readGrantRecord,
  reclaimExpiredReservations,
  remainingFor,
  utcDate,
  type DailyProviderStarts,
  type FreeGenerationGrant,
} from './freeGenerationLedger';
import { readRecoveryLedger, updateRecoveryLedger } from './freeGenerationRecoveryCas';
import {
  assertRecoveryTiming,
  isRecoveryFreeGenerationOutcome,
  pruneRecoveryReceipts,
  recoveryOperationTiming,
  RECOVERY_DAILY_RECEIPT_LIMIT,
  RECOVERY_GRANT_RECEIPT_LIMIT,
  type RecoveryDailyFreeGenerationReceipt,
  type RecoveryFreeGenerationOperation,
  type RecoveryFreeGenerationOutcome,
  type RecoveryFreeGenerationReservationReceipt,
  type RecoveryFreeGenerationSettlementReceipt,
  type RecoveryOperationTiming,
} from './freeGenerationRecoveryReceipts';

function validateOperation(
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): RecoveryOperationTiming {
  if (!isInstallationId(installationId)) throw new Error('Invalid free generation installation');
  const timing = recoveryOperationTiming(operation);
  const now = Date.now();
  if (
    new Date(timing.admittedAt).getTime() > now ||
    new Date(timing.retainUntil).getTime() <= now
  ) {
    throw new Error('Recovery free generation operation is outside its retention window');
  }
  return timing;
}

function reservationFor(
  grant: FreeGenerationGrant,
  operation: RecoveryFreeGenerationOperation
): RecoveryFreeGenerationReservationReceipt | undefined {
  const receipt = grant.recoveryOperations[operation.operationId]?.reservation;
  if (receipt) assertRecoveryTiming(receipt, operation);
  return receipt;
}

function assertLiveAdmission(timing: RecoveryOperationTiming, now: Date): void {
  if (new Date(timing.expiresAt).getTime() <= now.getTime()) {
    throw new Error('Recovery free generation admission expired');
  }
}

export async function reserveRecoveryFreeGeneration(
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): Promise<RecoveryFreeGenerationReservationReceipt> {
  const timing = validateOperation(installationId, operation);
  return updateRecoveryLedger(
    installationId,
    readGrantRecord,
    (grant) => reservationFor(grant, operation),
    (grant, now) => {
      assertLiveAdmission(timing, now);
      reclaimExpiredReservations(grant, now);
      if (Object.keys(grant.recoveryOperations).length >= RECOVERY_GRANT_RECEIPT_LIMIT) {
        throw new Error('Recovery free generation receipt capacity is unavailable');
      }
      grant.attempts += 1;
      grant.lastAttemptAt = timing.admittedAt;
      let reservation: RecoveryFreeGenerationReservationReceipt;
      if (remainingFor(grant) === 0) {
        grant.failures += 1;
        grant.lastFailureAt = timing.admittedAt;
        grant.lastFailureKind = 'exhausted';
        reservation = { ...timing, reserved: false, reason: 'exhausted', remaining: 0 };
      } else {
        grant.reservations[timing.operationId] = timing.expiresAt;
        reservation = {
          ...timing,
          reserved: true,
          reservationId: timing.operationId,
          remaining: remainingFor(grant),
        };
      }
      grant.recoveryOperations[timing.operationId] = { reservation, settlement: null };
    }
  );
}

function dailyReceiptFor(
  daily: DailyProviderStarts,
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): RecoveryDailyFreeGenerationReceipt | undefined {
  const receipt = daily.recoveryStarts[operation.operationId];
  if (receipt) {
    assertRecoveryTiming(receipt, operation);
    if (receipt.installationId !== installationId) {
      throw new Error('Recovery daily free generation operation conflicts with its installation');
    }
  }
  return receipt;
}

async function requireReservation(
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): Promise<void> {
  const { record } = await readRecoveryLedger(installationId, readGrantRecord);
  const receipt = reservationFor(record, operation);
  if (!receipt?.reserved) throw new Error('Recovery free generation reservation was not accepted');
  if (
    record.recoveryOperations[operation.operationId].settlement ||
    record.reservations[operation.operationId] !== receipt.expiresAt
  ) {
    throw new Error('Recovery free generation reservation is no longer pending');
  }
}

export async function reserveRecoveryDailyFreeGeneration(
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): Promise<RecoveryDailyFreeGenerationReceipt> {
  const timing = validateOperation(installationId, operation);
  return updateRecoveryLedger(
    dailyProviderStartKey(timing.dailyDate),
    (value) => normalizeDailyProviderStarts(value, timing.dailyDate),
    (daily) => dailyReceiptFor(daily, installationId, operation),
    async (daily, now) => {
      await requireReservation(installationId, operation);
      pruneRecoveryReceipts(daily.recoveryStarts, (entry) => entry.retainUntil, now);
      if (Object.keys(daily.recoveryStarts).length >= RECOVERY_DAILY_RECEIPT_LIMIT) {
        throw new Error('Recovery daily free generation receipt capacity is unavailable');
      }
      let reason: 'expired' | 'day-ended' | 'daily-limit' | null = null;
      if (new Date(timing.expiresAt).getTime() <= now.getTime()) reason = 'expired';
      else if (utcDate(now) !== timing.dailyDate) reason = 'day-ended';
      else if (daily.starts >= FREE_GENERATION_DAILY_PROVIDER_START_LIMIT) reason = 'daily-limit';
      if (reason) {
        daily.recoveryStarts[timing.operationId] = {
          ...timing,
          installationId,
          reserved: false,
          reason,
          remaining: Math.max(0, FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - daily.starts),
        };
      } else {
        daily.starts += 1;
        daily.recoveryStarts[timing.operationId] = {
          ...timing,
          installationId,
          reserved: true,
          remaining: FREE_GENERATION_DAILY_PROVIDER_START_LIMIT - daily.starts,
        };
      }
    }
  );
}

function settlementFor(
  grant: FreeGenerationGrant,
  operation: RecoveryFreeGenerationOperation
): RecoveryFreeGenerationSettlementReceipt | undefined {
  reservationFor(grant, operation);
  return grant.recoveryOperations[operation.operationId]?.settlement ?? undefined;
}

async function requireDailyStart(
  installationId: string,
  operation: RecoveryFreeGenerationOperation
): Promise<void> {
  const timing = recoveryOperationTiming(operation);
  const { record } = await readRecoveryLedger(dailyProviderStartKey(timing.dailyDate), (value) =>
    normalizeDailyProviderStarts(value, timing.dailyDate)
  );
  const daily = dailyReceiptFor(record, installationId, operation);
  if (!daily?.reserved) throw new Error('Recovery daily free generation start was not accepted');
}

function validateOutcome(outcome: RecoveryFreeGenerationOutcome): void {
  if (!isRecoveryFreeGenerationOutcome(outcome)) {
    throw new Error('Invalid recovery free generation outcome');
  }
}

function recordFailure(
  grant: FreeGenerationGrant,
  kind: FreeGenerationFailureKind,
  at: string
): void {
  grant.failures += 1;
  grant.lastFailureAt = at;
  grant.lastFailureKind = kind;
}

export async function settleRecoveryFreeGeneration(
  installationId: string,
  operation: RecoveryFreeGenerationOperation,
  outcome: RecoveryFreeGenerationOutcome
): Promise<RecoveryFreeGenerationSettlementReceipt> {
  const timing = validateOperation(installationId, operation);
  validateOutcome(outcome);
  return updateRecoveryLedger(
    installationId,
    readGrantRecord,
    (grant) => settlementFor(grant, operation),
    async (grant, now) => {
      const reservation = reservationFor(grant, operation);
      if (!reservation?.reserved)
        throw new Error('Recovery free generation reservation was not accepted');
      reclaimExpiredReservations(grant, now);
      const entry = grant.recoveryOperations[operation.operationId];
      if (entry.settlement) return;
      if (outcome.kind === 'failure' && outcome.failureKind === 'abandoned') {
        throw new Error('Recovery abandonment requires an expired reservation');
      }
      if (grant.reservations[operation.operationId] !== timing.expiresAt) {
        throw new Error('Recovery free generation reservation is unavailable');
      }
      delete grant.reservations[operation.operationId];
      if (outcome.kind === 'success') {
        await requireDailyStart(installationId, operation);
        if (grant.successful >= FREE_GENERATION_LIMIT)
          throw new Error('Free generation grant exhausted');
        grant.successful += 1;
        grant.lastSuccessAt = now.toISOString();
      } else recordFailure(grant, outcome.failureKind, now.toISOString());
      entry.settlement = {
        ...timing,
        outcome,
        settledAt: now.toISOString(),
        remaining: remainingFor(grant),
      };
    }
  );
}
