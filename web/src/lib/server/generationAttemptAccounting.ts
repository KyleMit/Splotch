import { error } from '@sveltejs/kit';
import { RECOVERY_PROTOCOL, RecoveryFault } from '../ai/generationAttempt';
import {
  attemptDigest,
  outcomeOf,
  type AttemptRecord,
  type AttemptFunding,
} from './generationAttempts';
import {
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  settleRecoveryFreeGeneration,
} from './freeGenerationGrants';
import type { RecoveryCredential } from './generationAttemptRequest';
export interface RecoveryLedger {
  reserve: typeof reserveRecoveryFreeGeneration;
  reserveDaily: typeof reserveRecoveryDailyFreeGeneration;
  settle: typeof settleRecoveryFreeGeneration;
}
export type RecoveryRawRecord = Extract<AttemptRecord, { phase: 'image' | 'refusal' | 'error' }>;
export type RecoverySettlement = Readonly<{ receiptDigest: string; remaining: number | null }>;
function operation(record: AttemptRecord) {
  return {
    operationId: record.admission.identity.id,
    admittedAt: new Date(record.admission.admittedAt).toISOString(),
  };
}
async function recoveryLedgerCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    console.warn('[recovery-ledger] a stable ledger operation could not be confirmed');
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  }
}
export class RecoveryAccounting {
  constructor(private readonly ledger: RecoveryLedger) {}
  async fund(record: AttemptRecord, credential: RecoveryCredential): Promise<AttemptFunding> {
    const stable = operation(record);
    if (credential.kind !== 'free')
      return {
        kind: credential.kind,
        receiptDigest: attemptDigest(
          JSON.stringify([
            RECOVERY_PROTOCOL,
            'credential-funding-v1',
            stable,
            record.admission.credentialBinding,
            credential.kind,
          ])
        ),
      };
    const reservation = await recoveryLedgerCall(() =>
      this.ledger.reserve(credential.identity, stable)
    );
    if (!reservation.reserved) throw error(403, 'Your free creations are used up');
    const daily = await recoveryLedgerCall(() =>
      this.ledger.reserveDaily(credential.identity, stable)
    );
    if (!daily.reserved) {
      await recoveryLedgerCall(() =>
        this.ledger.settle(credential.identity, stable, {
          kind: 'failure',
          failureKind: 'daily-limit',
        })
      );
      throw error(503, 'Free creations are unavailable today');
    }
    return {
      kind: 'free',
      receiptDigest: attemptDigest(
        JSON.stringify([RECOVERY_PROTOCOL, 'free-funding-v1', reservation, daily])
      ),
    };
  }
  async settle(
    record: RecoveryRawRecord,
    credential: RecoveryCredential,
    imageUsable = true
  ): Promise<RecoverySettlement> {
    if (record.funding.kind !== credential.kind) throw new RecoveryFault('RECOVERY_CONFLICT');
    const rawOutcome = outcomeOf(record);
    if (credential.kind !== 'free')
      return {
        remaining: null,
        // This durable delivery fact is independent of the best-effort usage tally.
        receiptDigest: attemptDigest(
          JSON.stringify([
            RECOVERY_PROTOCOL,
            'credential-settlement-v1',
            record.admission.identity.id,
            record.admission.admittedAt,
            record.admission.credentialBinding,
            record.funding,
            rawOutcome,
          ])
        ),
      };
    const wanted =
      record.phase === 'image' && imageUsable
        ? { kind: 'success' as const }
        : {
            kind: 'failure' as const,
            failureKind: record.phase === 'refusal' ? ('safety' as const) : ('upstream' as const),
          };
    const receipt = await recoveryLedgerCall(() =>
      this.ledger.settle(credential.identity, operation(record), wanted)
    );
    if (JSON.stringify(receipt.outcome) !== JSON.stringify(wanted))
      throw new RecoveryFault('RECOVERY_UNAVAILABLE');
    return {
      receiptDigest: attemptDigest(
        JSON.stringify([RECOVERY_PROTOCOL, 'free-settlement-v1', receipt])
      ),
      remaining: receipt.remaining,
    };
  }
}
export function openRecoveryAccounting(): RecoveryAccounting {
  return new RecoveryAccounting({
    reserve: reserveRecoveryFreeGeneration,
    reserveDaily: reserveRecoveryDailyFreeGeneration,
    settle: settleRecoveryFreeGeneration,
  });
}
