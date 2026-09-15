import { AI_ESTIMATE_MS, createDialProgress } from '$lib/ai/dialProgress';
import { aiGenerationState, type AiResultState } from './aiGeneration.svelte';
import { unreachable } from '$lib/unreachable';

export interface AiProgressState {
  readonly value: number;
  // The estimate has run out and the picture is still coming — the dial holds
  // a pulse rather than a stalled bar.
  readonly waiting: boolean;
  // The reveal has finished: the dial and its confetti are done, and the
  // picture itself is what the modal shows.
  readonly revealed: boolean;
  // Follows the generation machine from a detached effect root, so the loop
  // outlives the dial that unmounts when the child minimizes.
  install(): void;
  dispose(): void;
}

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
export function createAiProgress(
  state: AiResultState,
  estimateMs: number = AI_ESTIMATE_MS
): AiProgressState {
  const dial = createDialProgress(estimateMs);

  let value = $state(0);
  let waiting = $state(false);
  let revealed = $state(false);

  // Loop bookkeeping — intentionally untracked. `settled` latches the reveal so
  // a re-run of the arrival effect (restoring re-reads `minimized`) can't ramp a
  // picture that is already on screen a second time.
  let rafId = 0;
  let settled = false;
  let stopEffects: (() => void) | null = null;

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

  // One effect per phase transition the loop reacts to. Reading `kind` alone
  // keeps a result's later auto-save update from re-running the reveal.
  function watch() {
    $effect(() => {
      switch (state.phase.kind) {
        case 'generating':
          start();
          return;
        case 'result':
          // Nothing is watching the dial while the run waits in the corner, so
          // there is nothing for a ramp to animate — reveal outright, and the
          // restoring tap lands on the finished picture instead of a dial
          // catching up to a result that has been ready for a minute.
          complete(state.minimized);
          return;
        case 'error':
          stop();
          return;
        case 'closed':
          reset();
          return;
        default:
          unreachable(state.phase);
      }
    });
  }

  return {
    get value() {
      return value;
    },
    get waiting() {
      return waiting;
    },
    get revealed() {
      return revealed;
    },
    install() {
      stopEffects ??= $effect.root(watch);
    },
    dispose() {
      stopEffects?.();
      stopEffects = null;
      stop();
    },
  };
}

export const aiProgressState = createAiProgress(aiGenerationState);

// Installed at module load (no component host) so the loop keeps running while
// the modal is unmounted in the corner. Client-only: the loop is rAF-driven, and
// effects never run during SSR anyway.
if (typeof requestAnimationFrame !== 'undefined') aiProgressState.install();
