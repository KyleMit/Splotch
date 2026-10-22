// The progress engine behind every surface that shows how far along a
// generation is — the result modal's dial and the waiting polaroid's caption
// bar. It owns no Svelte reactivity: state/aiProgress.svelte.ts pumps
// `tick(now)` from its rAF loop and publishes the returned fields.

// How long a generation is expected to take, which paces the fill curve — not a
// timeout. The overrun phase below covers everything past it, up to the poll's
// own GENERATION_POLL_TIMEOUT_MS (limits.ts). Measured against the OpenAI
// provider (ADR-0113), where a typical run lands around 25s: an estimate under
// the real arrival leaves the dial stalled in its overrun pulse for the last
// stretch of every successful generation, which reads as stuck rather than
// nearly done. The loading copy is written from this number (loadingCopy.ts).
export const AI_ESTIMATE_MS = 30_000;

// Progress the estimate phase can fill to before the request actually resolves.
const ESTIMATE_CEILING = 0.92;
// Extra progress the overrun phase asymptotes toward (0.92 → 0.98, never reached).
const OVERRUN_HEADROOM = 0.06;
// Time constant (ms) of the overrun phase's exponential approach.
const OVERRUN_TAU_MS = 5000;
// Per-frame fraction of the remaining gap closed once the result is revealed.
const REVEAL_RATE = 0.16;
// Snap progress to 1 once it crosses this.
const REVEAL_SNAP_THRESHOLD = 0.999;
// Weight on the linear term of the fill curve; the sine-ease term takes the rest.
const LINEAR_MIX = 0.55;

export function createDialProgress(estimateMs: number) {
  let startTime = 0;
  let progress = 0;
  let done = false;

  // Mostly-linear so it advances at a steady, even pace — just a touch of sine
  // easing softens the very start and end without a slow ramp or a late rush.
  const fillCurve = (t: number) =>
    LINEAR_MIX * t + (1 - LINEAR_MIX) * (-(Math.cos(Math.PI * t) - 1) / 2);

  return {
    start(now: number) {
      startTime = now;
      progress = 0;
      done = false;
    },
    markDone() {
      done = true;
    },
    tick(now: number): { progress: number; waiting: boolean; revealed: boolean } {
      if (!done) {
        const elapsed = now - startTime;
        if (elapsed < estimateMs) {
          progress = ESTIMATE_CEILING * fillCurve(elapsed / estimateMs);
          return { progress, waiting: false, revealed: false };
        }
        const over = elapsed - estimateMs;
        progress = ESTIMATE_CEILING + OVERRUN_HEADROOM * (1 - Math.exp(-over / OVERRUN_TAU_MS));
        return { progress, waiting: true, revealed: false };
      }
      // Iterative ease off the previous frame's progress, not off elapsed time,
      // so `progress` must persist as private state across ticks.
      progress += (1 - progress) * REVEAL_RATE;
      if (progress >= REVEAL_SNAP_THRESHOLD) {
        progress = 1;
        return { progress, waiting: false, revealed: true };
      }
      return { progress, waiting: false, revealed: false };
    },
  };
}
