import type { BrushType } from '../state/tool.svelte';
import { getMagicBrushState } from './magicBrush';
import { getMagicWorkerState } from './magicSheetRasterClient';
import {
  magicWorkCounters,
  type MagicRecodeCaller,
  type MagicRecodeOutcome,
  type MagicWorkCountSnapshot,
  type ReadonlyMagicValue,
} from './magicWorkDebug';
import { PERF_MARKS } from './perf';

export type { MagicRecodeOutcome } from './magicWorkDebug';

type MagicEngineFacts = Readonly<{ brush: BrushType; engineLive: boolean; paperSized: boolean }>;
export interface MagicWorkWitness {
  readonly magicWitnessRevision: 1;
  readonly magicEngineFacts: MagicEngineFacts;
  readonly magicBrushState: ReadonlyMagicValue<ReturnType<typeof getMagicBrushState>>;
  readonly magicWorkerState: ReadonlyMagicValue<ReturnType<typeof getMagicWorkerState>>;
  readonly magicWorkCounts: MagicWorkCountSnapshot;
}

export function magicWorkWitness(facts: MagicEngineFacts): MagicWorkWitness | null {
  if (!PERF_MARKS || !magicWorkCounters) return null;
  return {
    magicWitnessRevision: 1,
    magicEngineFacts: { ...facts },
    magicBrushState: getMagicBrushState(),
    magicWorkerState: getMagicWorkerState(),
    magicWorkCounts: magicWorkCounters.snapshot(),
  };
}

export function traceMagicRecode(caller: MagicRecodeCaller, recode: () => MagicRecodeOutcome) {
  if (!PERF_MARKS) return recode();
  const start = performance.now();
  let outcome: MagicRecodeOutcome | 'threw' = 'threw';
  try {
    outcome = recode();
    return outcome;
  } finally {
    if (PERF_MARKS) {
      magicWorkCounters?.recordRecode(caller, outcome);
      performance.measure('magicWitness.recode', { start });
    }
  }
}
