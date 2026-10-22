// Shared product contracts for the tiled history implementation.
import type { PaperLayoutSnapshot } from './paperLayout';

// The number of committed drawing actions a child can take back. Exported so
// tiled history, the perf scenarios, and E2E coverage share one value.
export const MAX_UNDO_DEPTH = 20;

export interface RecordedPaperState {
  pxW: number;
  pxH: number;
  cssW: number;
  cssH: number;
  angle: number;
  presentation?: PaperLayoutSnapshot;
}
