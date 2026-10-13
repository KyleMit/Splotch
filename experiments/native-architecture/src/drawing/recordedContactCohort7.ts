import { createLiveCohortRecorder7 } from './cohortRecorder7';
import { readDrawingPaper, type AdoptedPaper } from './paperSpace';
import { MAX_SAVED_BYTES_7, type Command7, type Granularity7, type Point7, type Style7 } from './recordedTypes7';
import type { RecorderSnapshot7 } from './recordedSnapshot7';

export type CompletedCohort7 = Readonly<{ paper: AdoptedPaper; command: Command7; seedCursor: number }>;
export type LiveCohort7 = RecorderSnapshot7 & Readonly<{ paper: AdoptedPaper }>;

export function createRecordedContactCohort7(paper: AdoptedPaper, granularity: Granularity7, firstSeed: number) {
  const reference = readDrawingPaper(paper);
  if (reference.kind !== 'adopted') throw new Error('Recorded input requires adopted paper.');
  const recorder = createLiveCohortRecorder7(reference, granularity, firstSeed);
  const active = new Map<string, number>();
  let closed = false;
  let cached: LiveCohort7 | null = null;
  function check() {
    if (closed) throw new Error('The recorded cohort is closed.');
  }
  function write<T>(action: () => T): T {
    check();
    try { return action(); } catch (error) { closed = true;active.clear();recorder.cancel();cached = null;throw error; }
  }
  function contact(identifier: string): number {
    const index = active.get(identifier);
    if (index === undefined) throw new Error('The recorded contact is not active.');
    return index;
  }
  return {
    allocationCursor: recorder.allocationCursor,
    start(identifier: string, style: Style7, point: Point7) {
      return write(() => {
        if (active.has(identifier)) throw new Error('Invalid recorded contact start.');
        const index = recorder.start(style, point);
        active.set(identifier, index);
        return index;
      });
    },
    move(identifier: string, samples: readonly Point7[]) {
      return write(() => recorder.accept({ kind: 'move', contact: contact(identifier), samples }));
    },
    drain() { return write(() => recorder.accept({ kind: 'drain' })); },
    snapshot(): LiveCohort7 {
      check();
      const next = recorder.snapshot();
      if (cached && cached.styles === next.styles && cached.ops === next.ops) return cached;
      cached = Object.freeze({ paper: reference, ...next });
      return cached;
    },
    end(identifier: string): CompletedCohort7 | null {
      return write(() => {
        recorder.accept({ kind: 'end', contact: contact(identifier), samples: [] });
        active.delete(identifier);
        if (active.size) return null;
        const result = recorder.finish();
        if (new TextEncoder().encode(JSON.stringify(result.command)).byteLength > MAX_SAVED_BYTES_7)
          throw new Error('The recorded cohort is too large to retain.');
        closed = true;
        return Object.freeze({ paper: reference, command: result.command, seedCursor: result.seedCursor });
      });
    },
    cancel() { if (closed) return;closed = true;active.clear();recorder.cancel();cached = null; },
    hasActive() { return !closed && active.size > 0; },
  };
}
