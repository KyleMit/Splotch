import { renderOp, type StrokeGroupCommand } from './strokeOps';
import type { HistoryDebug } from './undoHistory';
import type { HistoryBaseTile, LiveTile, TiledCanvasSnapshot } from './tiledSurfaces';
import type { UndoTileSnapshot } from './tiledUndoPatches';

interface HistoryDebugInput {
  history: StrokeGroupCommand[];
  undoableCommands: number;
  undoSnapshots: Array<Map<number, UndoTileSnapshot> | undefined>;
  baseTiles: HistoryBaseTile[];
  strokeRevision: number | undefined;
  activeCommand: StrokeGroupCommand | null;
}

export function buildTiledHistoryDebug(input: HistoryDebugInput): HistoryDebug {
  const undoTiles = input.undoSnapshots.flatMap((snapshots) => [...(snapshots?.values() ?? [])]);
  const rasterBytes = undoTiles.reduce(
    (total, snapshot) => total + snapshot.canvas.width * snapshot.canvas.height * 4,
    0
  );
  const baseRasterBytes = input.baseTiles.reduce(
    (total, tile) => total + tile.width * tile.height * 4,
    0
  );
  return {
    strokeRevision: input.strokeRevision,
    snapshots: input.undoableCommands,
    liveRasters: input.undoSnapshots.filter((snapshots) => snapshots && snapshots.size > 0).length,
    rasterBytes,
    blobBytes: 0,
    baseRasters: input.baseTiles.length,
    baseRasterBytes,
    historyLength: input.history.length,
    patchBytes: rasterBytes,
    pendingCommands: input.activeCommand ? 1 : 0,
  };
}

interface CanvasSnapshotInput {
  canvas: HTMLCanvasElement | null;
  liveTiles: LiveTile[];
  hasActivePointers: boolean;
  width: number;
  height: number;
}

export function captureTiledCanvasReadback(input: CanvasSnapshotInput): TiledCanvasSnapshot | null {
  if (
    !input.canvas ||
    input.liveTiles.length === 0 ||
    input.hasActivePointers ||
    typeof createImageBitmap !== 'function'
  ) {
    return null;
  }
  return {
    width: input.width,
    height: input.height,
    tiles: input.liveTiles
      .filter((tile) => !tile.canvas.hidden)
      .map((tile) => ({
        bitmap: createImageBitmap(tile.canvas),
        x: tile.x,
        y: tile.y,
      })),
  };
}

function renderCommand(
  target: CanvasRenderingContext2D,
  command: StrokeGroupCommand,
  paper: { width: number; height: number } | null
) {
  if (!paper) return;
  target.save();
  target.beginPath();
  target.rect(0, 0, paper.width, paper.height);
  target.clip();
  for (const op of command.ops) renderOp(target, op);
  target.restore();
}

export function renderTiledReadback(
  target: CanvasRenderingContext2D,
  base: HistoryBaseTile[],
  history: StrokeGroupCommand[],
  activeCommand: StrokeGroupCommand | null,
  paper: { width: number; height: number } | null
) {
  for (const tile of base) {
    if (tile.painted) target.drawImage(tile.canvas, tile.x, tile.y);
  }
  for (const command of history) renderCommand(target, command, paper);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(target, op);
  }
}
