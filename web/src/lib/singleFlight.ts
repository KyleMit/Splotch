/**
 * Wrap an async producer so overlapping callers share one run instead of each
 * starting their own.
 *
 * Extracted from its one caller (ReportFields' device-info collection) rather
 * than inlined because the behaviour that matters is only observable *during*
 * the in-flight window: a memoizer that caches the resolved value instead of
 * the pending promise looks identical once collection has settled, so an
 * end-to-end test that waits for the result cannot tell the two apart. As a
 * standalone function a test can hold the producer open and assert directly
 * that two overlapping callers share one run.
 *
 * A rejection clears the memo so a later caller retries, matching the
 * self-resetting lazy-init pattern in `idb.ts`; the rejection itself is
 * rethrown, leaving the caller to decide whether a failure is fatal.
 */
export function createSingleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;

  return () => {
    pending ??= run().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
