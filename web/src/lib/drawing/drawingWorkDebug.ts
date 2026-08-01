import type { LiveTile } from './tiledSurfaces';

interface CommandWork {
  inputOps: number;
  rasterizedOps: number;
  maxSurfaceVisitsPerOp: number;
}

export interface DrawingWorkDebug {
  liveSurfaceElements: number;
  realizedNormalBackings: number;
  realizedCrayonBackings: number;
  maxLiveBackingBytes: number;
  totalLiveBackingBytes: number;
  lastCommand: CommandWork | null;
}

const BYTES_PER_PIXEL = 4;
const SURFACES_PER_TILE = 3;

export function createDrawingWorkCounters() {
  let activeCommand: CommandWork | null = null;
  let lastCommand: CommandWork | null = null;

  return {
    begin() {
      activeCommand = { inputOps: 0, rasterizedOps: 0, maxSurfaceVisitsPerOp: 0 };
    },
    record(surfaceVisits: number) {
      if (!activeCommand) return;
      activeCommand.inputOps++;
      activeCommand.rasterizedOps += surfaceVisits;
      activeCommand.maxSurfaceVisitsPerOp = Math.max(
        activeCommand.maxSurfaceVisitsPerOp,
        surfaceVisits
      );
    },
    commit() {
      lastCommand = activeCommand ? { ...activeCommand } : null;
      activeCommand = null;
    },
    reset() {
      activeCommand = null;
      lastCommand = null;
    },
    debug(liveTiles: LiveTile[]): DrawingWorkDebug {
      let realizedNormalBackings = 0;
      let realizedCrayonBackings = 0;
      let maxLiveBackingBytes = 0;
      let totalLiveBackingBytes = 0;
      const countBacking = (backing: HTMLCanvasElement) => {
        const bytes = backing.width * backing.height * BYTES_PER_PIXEL;
        maxLiveBackingBytes = Math.max(maxLiveBackingBytes, bytes);
        totalLiveBackingBytes += bytes;
      };
      for (const tile of liveTiles) {
        if (tile.canvas.width === tile.width && tile.canvas.height === tile.height) {
          realizedNormalBackings++;
          countBacking(tile.canvas);
        }
        for (const backing of [tile.crayonBottom, tile.crayonTop]) {
          if (backing.width === tile.width && backing.height === tile.height) {
            realizedCrayonBackings++;
            countBacking(backing);
          }
        }
      }
      return {
        liveSurfaceElements: liveTiles.length * SURFACES_PER_TILE,
        realizedNormalBackings,
        realizedCrayonBackings,
        maxLiveBackingBytes,
        totalLiveBackingBytes,
        lastCommand: lastCommand ? { ...lastCommand } : null,
      };
    },
  };
}
