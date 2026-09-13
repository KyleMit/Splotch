import type { StrokeGroupCommand } from './strokeOps';
import type { HistoryBaseTile, PaperSize } from './tiledSurfaces';

function coveringPaper(first: PaperSize, second: PaperSize): PaperSize {
  return {
    width: Math.max(first.width, second.width),
    height: Math.max(first.height, second.height),
  };
}

export function commandClears(command: StrokeGroupCommand) {
  return command.ops.some((op) => op.kind === 'clear');
}

// Folded ink exists nowhere but the base, so a base holding ink never shrinks
// under a temporarily smaller paper; every read clips at the current paper
// (live tiles and export targets are paper-sized). Only a base with nothing
// painted re-tiles down, which loses nothing. Null means the base already fits.
export function retiledBaseExtent(
  tiles: readonly HistoryBaseTile[],
  current: PaperSize,
  required: PaperSize
): PaperSize | null {
  const extent = tiles.some((tile) => tile.painted) ? coveringPaper(current, required) : required;
  return extent.width === current.width && extent.height === current.height ? null : extent;
}

// A command stays confined to the papers it was drawn on, wherever it is
// replayed or folded. Ink past them was never on the page — pointer capture
// carries a stroke beyond the edge, and letterbox margins lie outside it — and
// an eraser must never reach base ink a paper was hiding when it erased.
export function commandFoldExtent(command: StrokeGroupCommand, paper: PaperSize): PaperSize {
  const recorded = command.recordedPaper;
  return command.drawnPaper ?? (recorded ? { width: recorded.pxW, height: recorded.pxH } : paper);
}

// A stroke still drawing when the paper changes goes on drawing onto the new
// paper, so its confinement widens to cover both.
export function widenActiveCommandPaper(command: StrokeGroupCommand | null, paper: PaperSize) {
  if (command) command.drawnPaper = coveringPaper(commandFoldExtent(command, paper), paper);
}

// A clear resets the whole page, not only the paper it was issued on: clipped
// to that paper it would leave base ink past it for the replay to show.
export function commandReadClip(command: StrokeGroupCommand, paper: PaperSize): PaperSize {
  if (commandClears(command)) return paper;
  const own = commandFoldExtent(command, paper);
  return {
    width: Math.min(own.width, paper.width),
    height: Math.min(own.height, paper.height),
  };
}

// Whether a full repaint could put base ink on the paper: the base holds some,
// and no clear still in the vector tail would wipe it.
export function retainedBaseInkCanShow(
  tiles: readonly HistoryBaseTile[],
  tail: readonly StrokeGroupCommand[]
) {
  return tiles.some((tile) => tile.painted) && !tail.some(commandClears);
}
