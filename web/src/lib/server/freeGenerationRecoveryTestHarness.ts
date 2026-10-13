import { expect, vi } from 'vitest';
import {
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  type RecoveryFreeGenerationOperation,
  type RecoveryFreeGenerationReservationReceipt,
} from './freeGenerationGrants';
import { readGrantRecord } from './freeGenerationLedger';

interface StoredEntry {
  data: unknown;
  etag: string;
}

export const INSTALLATION = 'a'.repeat(64);
export const ADMITTED_AT = '2026-10-12T12:00:00.000Z';
export const DAILY_KEY = 'daily-provider-starts/2026-10-12';
export function operation(index = 1, admittedAt = ADMITTED_AT): RecoveryFreeGenerationOperation {
  return { operationId: index.toString(16).padStart(64, '0'), admittedAt };
}
export function expectAccepted(
  receipt: RecoveryFreeGenerationReservationReceipt
): asserts receipt is Extract<RecoveryFreeGenerationReservationReceipt, { reserved: true }> {
  expect(receipt.reserved).toBe(true);
  if (!receipt.reserved) throw new Error('Expected an accepted recovery reservation');
}
export function createRecoveryLedgerTestFixture() {
  const entries = new Map<string, StoredEntry>();
  const backend = { version: 0, dropAcknowledgementFor: '', omitEtagFor: '' };
  function store() {
    return {
      get: vi.fn(async (key: string) => structuredClone(entries.get(key)?.data ?? null)),
      getWithMetadata: vi.fn(async (key: string) => {
        const entry = entries.get(key);
        const snapshot = entry
          ? {
              data: structuredClone(entry.data),
              etag: backend.omitEtagFor === key ? '' : entry.etag,
              metadata: {},
            }
          : null;
        await Promise.resolve();
        return snapshot;
      }),
      setJSON: vi.fn(
        async (
          key: string,
          data: unknown,
          condition: { onlyIfNew?: boolean; onlyIfMatch?: string }
        ) => {
          await Promise.resolve();
          const existing = entries.get(key);
          if (condition.onlyIfNew && existing) return { modified: false };
          if (condition.onlyIfMatch && existing?.etag !== condition.onlyIfMatch)
            return { modified: false };
          const etag = `v${++backend.version}`;
          entries.set(key, { data: structuredClone(data), etag });
          if (backend.dropAcknowledgementFor === key) {
            backend.dropAcknowledgementFor = '';
            throw new Error('Write response lost after commit');
          }
          return { modified: true, etag };
        }
      ),
    };
  }
  async function fund(input = operation(), installationId = INSTALLATION) {
    const reservation = await reserveRecoveryFreeGeneration(installationId, input);
    if (!reservation.reserved) throw new Error('Expected an accepted recovery reservation');
    const daily = await reserveRecoveryDailyFreeGeneration(installationId, input);
    return { reservation, daily };
  }
  function grant() {
    return readGrantRecord(entries.get(INSTALLATION)?.data, new Date());
  }
  function seedDaily(starts: number) {
    entries.set(DAILY_KEY, { data: { version: 1, date: '2026-10-12', starts }, etag: 'seed' });
  }
  return { entries, backend, store, fund, grant, seedDaily };
}
