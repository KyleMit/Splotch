import { sleep } from '../../../lib/proc.mjs';
import { rethrowIfBroken } from '../../lib/error-classification.mjs';

const DEFAULT_POLL_INTERVAL_MS = 1_000;

// The shared retry loop for device state that is legitimately not-there-yet: a
// page that has not loaded, a report that has not uploaded, a CDP target that
// has not appeared. Three identical private copies predated this module.
//
// The catch is the part that earns a shared home (issue 1296): a per-attempt
// failure is the normal retried state, but a ReferenceError is broken code,
// and retrying it until the deadline reports the same timeout a genuinely
// absent device produces — the exact shape that hid a missing import for a
// whole review cycle. Broken code escapes the loop immediately; everything
// else stays a quiet retry.
export async function pollFor(callback, timeoutMs, { intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback().catch((error) => {
      rethrowIfBroken(error);
      return null;
    });
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}
