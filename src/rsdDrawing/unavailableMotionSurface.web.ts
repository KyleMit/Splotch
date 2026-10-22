import { createLazyExport, useLazyValue } from '../lazyExport';

// The motion arrives with the other Undo cues' chunk; until it lands, a press at the end of
// history shows the parked tile alone.
const cue = createLazyExport(() => import('./undoFeedbackChunk.web'));
const whole = (loaded: Awaited<ReturnType<typeof cue.load>>) => loaded;

export function useUnavailableMotion() {
  return useLazyValue(cue, whole, 'The Undo unavailable cue') ?? null;
}
