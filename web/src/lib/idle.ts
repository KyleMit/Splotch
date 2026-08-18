// Run work once the main thread is genuinely idle, returning a cancel function.
//
// Safari and iOS lack requestIdleCallback (below our support floor), and a bare
// timeout is not idleness: on a busy boot it fires mid-interaction, and its
// work lands inside frames the child is drawing through (PR #1124's physical
// iPad idle gate caught the Settings prewarm doing exactly that). The fallback
// approximates the two signals that gate scores — input quiet and frame
// headroom — by requeueing while a pointer is down, input is recent, or the
// latest frame gap ran long, and otherwise running the callback at the top of
// a frame the screen had headroom for.
const IDLE_FALLBACK_MS = 200;
// A finger that touched the screen this recently means more interaction is
// likely mid-flight; longer than a tap's own duration, shorter than a pause
// that reads as the child looking at their drawing.
const INPUT_QUIET_MS = 300;
// How long a deferred callback waits before re-checking the signals.
const IDLE_RETRY_MS = 250;
// Two consecutive animation frames further apart than this mean the main
// thread is already missing its budget; adding work would stretch it further.
const FRAME_BUSY_GAP_MS = 25;

const hasNativeIdle = () => typeof requestIdleCallback === 'function';

// Input tracking for the fallback's quiet signal. Self-initialized at module
// load behind a client-only probe; the handlers only stamp scalars, so they
// are safe on the pointer hot path.
let lastInputMs = -Infinity;
let activePointers = 0;
if (typeof window !== 'undefined' && !hasNativeIdle()) {
  const down = () => {
    activePointers += 1;
    lastInputMs = performance.now();
  };
  const up = () => {
    activePointers = Math.max(0, activePointers - 1);
    lastInputMs = performance.now();
  };
  window.addEventListener('pointerdown', down, { passive: true, capture: true });
  window.addEventListener('pointerup', up, { passive: true, capture: true });
  window.addEventListener('pointercancel', up, { passive: true, capture: true });
}

function inputQuiet(): boolean {
  return activePointers === 0 && performance.now() - lastInputMs >= INPUT_QUIET_MS;
}

function scheduleCooperativeFallback(fn: () => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  let frame = 0;
  const requeue = () => {
    timer = setTimeout(attempt, IDLE_RETRY_MS);
  };
  const attempt = () => {
    if (cancelled) return;
    if (!inputQuiet()) {
      requeue();
      return;
    }
    // No animation frames at all (SSR-adjacent tests, workers): the quiet
    // timer is the best signal available, so run directly.
    if (typeof requestAnimationFrame !== 'function') {
      fn();
      return;
    }
    frame = requestAnimationFrame((first) => {
      frame = requestAnimationFrame((second) => {
        if (cancelled) return;
        if (second - first > FRAME_BUSY_GAP_MS || !inputQuiet()) {
          requeue();
          return;
        }
        fn();
      });
    });
  };
  timer = setTimeout(attempt, IDLE_FALLBACK_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
  };
}

export function scheduleIdle(fn: () => void): () => void {
  if (hasNativeIdle()) {
    const handle = requestIdleCallback(fn);
    return () => cancelIdleCallback(handle);
  }
  return scheduleCooperativeFallback(fn);
}
