// The AI result dial's progress engine, factored out of AiDial.svelte so the
// fill-curve / overrun / done-ramp math can be unit tested without a live DOM.
// It owns no Svelte reactivity: the component pumps `tick(now)` from its rAF
// loop and copies the returned fields onto its own $state.
export function createDialProgress(estimateMs: number) {
  let startTime = 0;
  let progress = 0;
  let done = false;

  // Mostly-linear so it advances at a steady, even pace — just a touch of sine
  // easing softens the very start and end without a slow ramp or a late rush.
  const fillCurve = (t: number) => 0.55 * t + 0.45 * (-(Math.cos(Math.PI * t) - 1) / 2);

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
          progress = 0.92 * fillCurve(elapsed / estimateMs);
          return { progress, waiting: false, revealed: false };
        }
        const over = elapsed - estimateMs;
        progress = 0.92 + 0.06 * (1 - Math.exp(-over / 5000));
        return { progress, waiting: true, revealed: false };
      }
      // Iterative ease off the previous frame's progress, not off elapsed time,
      // so `progress` must persist as private state across ticks.
      progress += (1 - progress) * 0.16;
      if (progress >= 0.999) {
        progress = 1;
        return { progress, waiting: false, revealed: true };
      }
      return { progress, waiting: false, revealed: false };
    },
  };
}
