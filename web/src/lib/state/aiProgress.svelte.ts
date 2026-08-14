import { AI_ESTIMATE_MS, createDialProgress } from '$lib/ai/dialProgress';
import { aiResult, type AiResultState } from './aiGeneration.svelte';

/**
 * How far along the running generation is, and whether its picture has been
 * revealed yet — shared by every surface that shows a run in flight: the result
 * modal's dial and the waiting polaroid's caption bar (ADR-0116).
 *
 * It lives out here rather than in the dial because the dial unmounts the moment
 * a child minimizes, and a run whose progress died with its dial would restart
 * from zero on every restore. One loop, owned above both surfaces, is also what
 * lets a picture that lands while minimized be *already revealed* when the tap
 * comes back — a finished picture must never be shown behind a progress dial.
 */
export function createAiProgress(state: AiResultState, estimateMs: number = AI_ESTIMATE_MS) {
  const dial = createDialProgress(estimateMs);

  let value = $state(0);
  let waiting = $state(false);
  let revealed = $state(false);

  // Loop bookkeeping — intentionally untracked. `settled` latches the reveal so
  // a re-run of the arrival effect (restoring re-reads `minimized`) can't ramp a
  // picture that is already on screen a second time.
  let rafId = 0;
  let settled = false;

  function finishReveal() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    settled = true;
    value = 1;
    waiting = false;
    revealed = true;
  }

  function loop(now: number) {
    const step = dial.tick(now);
    value = step.progress;
    waiting = step.waiting;
    if (step.revealed) {
      finishReveal();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(rafId);
    settled = false;
    revealed = false;
    waiting = false;
    value = 0;
    dial.start(performance.now());
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function reset() {
    stop();
    settled = false;
    value = 0;
    waiting = false;
    revealed = false;
  }

  // `instant` skips the done-ramp for a picture nobody is watching arrive.
  function complete(instant: boolean) {
    if (settled) return;
    if (instant) {
      finishReveal();
      return;
    }
    dial.markDone();
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  /**
   * Follow the generation machine. Registers effects, so it must be called from
   * an effect context: the session-long root below, or a test's own root.
   */
  function watch() {
    $effect(() => {
      if (state.open && state.generating) start();
    });

    $effect(() => {
      if (state.open && !state.generating && state.resultUrl) {
        // Nothing is watching the dial while the run waits in the corner, so
        // there is nothing for a ramp to animate — reveal outright, and the
        // restoring tap lands on the finished picture instead of a dial
        // catching up to a result that has been ready for a minute.
        complete(state.minimized);
      }
    });

    $effect(() => {
      if (state.error) stop();
    });

    $effect(() => {
      if (!state.open) reset();
    });
  }

  return {
    get value() {
      return value;
    },
    // The estimate has run out and the picture is still coming — the dial holds
    // a pulse rather than a stalled bar.
    get waiting() {
      return waiting;
    },
    // The reveal has finished: the dial and its confetti are done, and the
    // picture itself is what the modal shows.
    get revealed() {
      return revealed;
    },
    watch,
  };
}

export const aiProgress = createAiProgress(aiResult);

// A detached effect root (no component host) is what keeps this alive while the
// modal is unmounted in the corner. Client-only: the loop is rAF-driven, and
// effects never run during SSR anyway.
if (typeof requestAnimationFrame !== 'undefined') {
  $effect.root(() => aiProgress.watch());
}
