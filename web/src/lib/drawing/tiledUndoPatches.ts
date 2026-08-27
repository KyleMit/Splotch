import type { StrokeGroupCommand } from './strokeOps';

interface SnapshotTile {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface TileDirtyBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface UndoTileSnapshot {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  tileWidth: number;
  tileHeight: number;
  dirty: TileDirtyBounds;
  hidden: boolean;
  cropped: boolean;
}

export function createTiledUndoPatches() {
  const byCommand = new WeakMap<StrokeGroupCommand, Map<number, UndoTileSnapshot>>();

  function capture(
    command: StrokeGroupCommand,
    tile: SnapshotTile,
    index: number,
    dirty: TileDirtyBounds = { x0: 0, y0: 0, x1: tile.width, y1: tile.height },
    hidden = tile.canvas.hidden === true
  ) {
    let snapshots = byCommand.get(command);
    if (!snapshots) {
      snapshots = new Map();
      byCommand.set(command, snapshots);
    }
    const existing = snapshots.get(index);
    if (existing) {
      existing.dirty.x0 = Math.min(existing.dirty.x0, dirty.x0);
      existing.dirty.y0 = Math.min(existing.dirty.y0, dirty.y0);
      existing.dirty.x1 = Math.max(existing.dirty.x1, dirty.x1);
      existing.dirty.y1 = Math.max(existing.dirty.y1, dirty.y1);
      return;
    }
    const canvasSnapshot = document.createElement('canvas');
    canvasSnapshot.width = tile.width;
    canvasSnapshot.height = tile.height;
    const snapshotContext = canvasSnapshot.getContext('2d');
    if (!snapshotContext) {
      byCommand.delete(command);
      return;
    }
    snapshotContext.drawImage(tile.canvas, 0, 0);
    snapshots.set(index, {
      canvas: canvasSnapshot,
      x: 0,
      y: 0,
      tileWidth: tile.width,
      tileHeight: tile.height,
      dirty: { ...dirty },
      hidden,
      cropped: false,
    });
  }

  // TRIAL T9: the deferred crayon pipeline seeds its under shadow from the
  // snapshot this module already captured, so crayon never reads the
  // composited tile itself. Only meaningful before crop().
  function peek(command: StrokeGroupCommand, index: number): HTMLCanvasElement | null {
    const snapshot = byCommand.get(command)?.get(index);
    return snapshot && !snapshot.cropped ? snapshot.canvas : null;
  }

  function crop(command: StrokeGroupCommand) {
    const snapshots = byCommand.get(command);
    if (!snapshots) return;
    for (const snapshot of snapshots.values()) {
      if (snapshot.cropped) continue;
      snapshot.cropped = true;
      const { x0, y0, x1, y1 } = snapshot.dirty;
      if (x0 === 0 && y0 === 0 && x1 === snapshot.tileWidth && y1 === snapshot.tileHeight) continue;
      if (x1 <= x0 || y1 <= y0) continue;
      const cropped = document.createElement('canvas');
      cropped.width = x1 - x0;
      cropped.height = y1 - y0;
      const croppedContext = cropped.getContext('2d');
      if (!croppedContext) continue;
      croppedContext.drawImage(
        snapshot.canvas,
        x0,
        y0,
        cropped.width,
        cropped.height,
        0,
        0,
        cropped.width,
        cropped.height
      );
      snapshot.canvas = cropped;
      snapshot.x = x0;
      snapshot.y = y0;
    }
  }

  function bytes(command: StrokeGroupCommand) {
    const snapshots = byCommand.get(command);
    if (!snapshots) return 0;
    return [...snapshots.values()].reduce(
      (total, snapshot) => total + snapshot.canvas.width * snapshot.canvas.height * 4,
      0
    );
  }

  return {
    peek,
    capture,
    crop,
    bytes,
    get: (command: StrokeGroupCommand) => byCommand.get(command),
    delete: (command: StrokeGroupCommand) => byCommand.delete(command),
  };
}
