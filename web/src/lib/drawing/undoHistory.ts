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

export function paperStateMatches(
  paper: Omit<RecordedPaperState, 'angle'>,
  angle: number,
  recorded: RecordedPaperState | undefined
): boolean {
  return (
    recorded !== undefined &&
    paper.pxW === recorded.pxW &&
    paper.pxH === recorded.pxH &&
    paper.cssW === recorded.cssW &&
    paper.cssH === recorded.cssH &&
    angle === recorded.angle
  );
}

export interface HistoryDebug {
  strokeRevision?: number;
  snapshots: number;
  liveRasters: number;
  rasterBytes: number;
  blobBytes: number;
  baseRasters?: number;
  baseRasterBytes?: number;
  historyLength?: number;
  patchBytes: number;
  pendingCommands: number;
}
