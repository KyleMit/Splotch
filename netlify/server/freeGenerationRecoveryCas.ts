import { getStore } from './blobs';
import { CAS_ATTEMPTS, CAS_BACKOFF_MS, FREE_GENERATION_STORE_NAME } from './freeGenerationLedger';
import { sleep } from './sleep';

function recoveryStore(): ReturnType<typeof getStore> {
  return getStore({ name: FREE_GENERATION_STORE_NAME, consistency: 'strong' });
}

export async function readRecoveryLedger<T>(
  key: string,
  normalize: (value: unknown, now: Date) => T
): Promise<{ record: T; etag: string | null }> {
  const existing = await recoveryStore().getWithMetadata(key, { type: 'json' });
  if (
    existing !== null &&
    existing !== undefined &&
    (typeof existing.etag !== 'string' || existing.etag.trim() === '')
  ) {
    throw new Error('Recovery free generation requires a nonempty ETag');
  }
  return { record: normalize(existing?.data, new Date()), etag: existing?.etag ?? null };
}

export async function updateRecoveryLedger<T, R>(
  key: string,
  normalize: (value: unknown, now: Date) => T,
  receiptFor: (record: T) => R | undefined,
  mutate: (record: T, now: Date) => void | Promise<void>
): Promise<R> {
  const store = recoveryStore();
  for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CAS_BACKOFF_MS * attempt);
    const { record, etag } = await readRecoveryLedger(key, normalize);
    const receipt = receiptFor(record);
    if (receipt !== undefined) return receipt;
    await mutate(record, new Date());
    const validated = normalize(record, new Date());
    const condition = etag === null ? { onlyIfNew: true as const } : { onlyIfMatch: etag };
    try {
      const write = await store.setJSON(key, validated, condition);
      if (!write.modified) continue;
    } catch (error) {
      // A rejected promise does not prove that the conditional write failed.
      const committed = receiptFor((await readRecoveryLedger(key, normalize)).record);
      if (committed !== undefined) return committed;
      throw error;
    }
    const committed = receiptFor((await readRecoveryLedger(key, normalize)).record);
    if (committed !== undefined) return committed;
    throw new Error('Recovery free generation write could not be confirmed');
  }
  throw new Error('Recovery free generation ledger is busy');
}
