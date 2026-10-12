// Guards an async submit against being superseded: each `begin()` bumps a
// monotonic counter, aborts the previous in-flight request, and hands back a
// fresh id + signal. A caller checks `isCurrent(id)` before applying a result,
// so only the newest submit ever wins. `cancel()` obsoletes the in-flight
// request the same way without starting a new one. `detach()` obsoletes it
// without aborting: the request keeps running to completion (a POST with a
// side effect must still land), but its result is no longer current and the
// next `begin()` has nothing left to abort. The abort lifecycle is owned here;
// the caller keeps its own success/failure wiring.
export interface LatestRequest {
  begin(): { id: number; signal: AbortSignal };
  cancel(): void;
  detach(): void;
  isCurrent(id: number): boolean;
}

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';
export type SubmitStatus = 'idle' | 'busy' | 'success' | 'error';

export function createLatestRequest(): LatestRequest {
  let current = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      current += 1;
      controller?.abort();
      controller = new AbortController();
      return { id: current, signal: controller.signal };
    },
    cancel() {
      current += 1;
      controller?.abort();
      controller = null;
    },
    detach() {
      current += 1;
      controller = null;
    },
    isCurrent(id: number) {
      return id === current;
    },
  };
}
