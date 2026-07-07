// Run work once the main thread is idle, returning a cancel function. Safari
// and iOS lack requestIdleCallback (below our support floor), so fall back to a
// short timeout that still lands after first paint.
const IDLE_FALLBACK_MS = 200;

export function scheduleIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(fn);
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(fn, IDLE_FALLBACK_MS);
  return () => clearTimeout(handle);
}
