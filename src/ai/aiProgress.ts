import { AI_ESTIMATE_MS, createDialProgress } from '../lib/ai/dialProgress';
import type { AiRun } from './uiState';

export type AiProgress = Readonly<{
  value: number;
  // The estimate has run out and the picture is still coming: the dial pulses
  // instead of standing still.
  overrun: boolean;
  // The dial has finished filling, so the picture itself is what shows.
  revealed: boolean;
}>;

// What the dial follows of a run. Its submitted drawing and picture change what the surfaces show,
// never how far the dial has filled.
type AiProgressRun = Pick<AiRun, 'id' | 'startedAt' | 'phase'>;

// Where the run is on screen: the open sheet watches the dial fill, the corner
// print only reads its caption bar, and nothing at all needs frames.
export type AiProgressPresence = 'sheet' | 'corner' | 'hidden';

// Published progress is quantized so a half-minute run re-renders its viewers a
// few times a second rather than on every frame. A quarter-percent step is below
// what the dial's wedge or the print's caption bar can show.
const PUBLISHED_PROGRESS_STEPS = 400;

const IDLE: AiProgress = { value: 0, overrun: false, revealed: false };
const REVEALED: AiProgress = { value: 1, overrun: false, revealed: true };

/**
 * How far along the current AI run is, owned above both surfaces that show it
 * (the sheet's waiting print and the corner print), the way the web app's
 * state/aiProgress.svelte.ts is. The fill is timed from the journal's own
 * creation time, so neither minimizing nor reopening the sheet restarts it.
 */
export function createAiProgress() {
  const dial = createDialProgress(AI_ESTIMATE_MS);
  const listeners = new Set<() => void>();
  let snapshot = IDLE;
  let runId: number | null = null;
  let settled = false;
  let frame: number | null = null;

  function publish(next: AiProgress) {
    // A restored journal on a clock that moved backward times from the future.
    const bounded = Math.min(1, Math.max(0, next.value));
    const value = Math.round(bounded * PUBLISHED_PROGRESS_STEPS) / PUBLISHED_PROGRESS_STEPS;
    if (
      value === snapshot.value &&
      next.overrun === snapshot.overrun &&
      next.revealed === snapshot.revealed
    )
      return;
    snapshot = { value, overrun: next.overrun, revealed: next.revealed };
    for (const listener of listeners) listener();
  }
  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  function finish() {
    stop();
    settled = true;
    publish(REVEALED);
  }
  function step() {
    frame = null;
    const next = dial.tick(Date.now());
    publish({ value: next.progress, overrun: next.waiting, revealed: next.revealed });
    if (next.revealed) settled = true;
    else frame = requestAnimationFrame(step);
  }
  function run() {
    if (frame === null && !settled) frame = requestAnimationFrame(step);
  }
  function begin(next: AiProgressRun) {
    stop();
    runId = next.id;
    settled = false;
    if (next.phase === 'arrived') {
      finish();
      return;
    }
    dial.start(next.startedAt);
    if (next.phase === 'failed') {
      publish(IDLE);
      return;
    }
    const now = dial.tick(Date.now());
    publish({ value: now.progress, overrun: now.waiting, revealed: false });
  }
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    follow(next: AiProgressRun | null, presence: AiProgressPresence) {
      if (!next) {
        stop();
        runId = null;
        settled = false;
        publish(IDLE);
        return;
      }
      if (next.id !== runId) begin(next);
      if (settled) return;
      if (next.phase === 'failed') {
        stop();
        return;
      }
      if (next.phase === 'arrived') {
        // Nothing is watching the dial in the corner, so a picture that lands
        // there is revealed outright rather than ramped behind a closed sheet.
        if (presence !== 'sheet') {
          finish();
          return;
        }
        dial.markDone();
      }
      if (presence === 'hidden') stop();
      else run();
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}

export type AiProgressOwner = ReturnType<typeof createAiProgress>;
