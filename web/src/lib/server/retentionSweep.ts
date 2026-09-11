export const RETENTION_SWEEP_CONCURRENCY = 4;

export async function settleWithRetentionConcurrency<T, Result>(
  items: readonly T[],
  operation: (item: T) => Promise<Result>
): Promise<PromiseSettledResult<Result>[]> {
  const results = new Array<PromiseSettledResult<Result>>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await operation(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(RETENTION_SWEEP_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
