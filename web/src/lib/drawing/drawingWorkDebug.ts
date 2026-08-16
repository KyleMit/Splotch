import { liveTileSurfaces, type LiveTile } from './tiledSurfaces';

interface CommandWork {
  inputOps: number;
  rasterizedOps: number;
  maxSurfaceVisitsPerOp: number;
}

export interface DrawingWorkDebug {
  backingMigrationPending: boolean;
  liveSurfaceElements: number;
  realizedNormalBackings: number;
  realizedCrayonBackings: number;
  maxLiveBackingBytes: number;
  totalLiveBackingBytes: number;
  lastCommand: CommandWork | null;
}

const BYTES_PER_PIXEL = 4;

export function createDrawingWorkCounters() {
  let activeCommand: CommandWork | null = null;
  let lastCommand: CommandWork | null = null;
  let strokeRevision = 0;

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
      strokeRevision++;
    },
    reset() {
      activeCommand = null;
      lastCommand = null;
      strokeRevision = 0;
    },
    strokeRevision() {
      return strokeRevision;
    },
    debug(liveTiles: LiveTile[], backingMigrationPending: boolean): DrawingWorkDebug {
      let realizedNormalBackings = 0;
      let realizedCrayonBackings = 0;
      let liveSurfaceElements = 0;
      let maxLiveBackingBytes = 0;
      let totalLiveBackingBytes = 0;
      const countBacking = (backing: HTMLCanvasElement) => {
        const bytes = backing.width * backing.height * BYTES_PER_PIXEL;
        maxLiveBackingBytes = Math.max(maxLiveBackingBytes, bytes);
        totalLiveBackingBytes += bytes;
      };
      for (const tile of liveTiles) {
        const [normalBacking, ...crayonBackings] = liveTileSurfaces(tile);
        liveSurfaceElements += 1 + crayonBackings.length;
        if (normalBacking.width === tile.width && normalBacking.height === tile.height) {
          realizedNormalBackings++;
          countBacking(normalBacking);
        }
        for (const backing of crayonBackings) {
          if (backing.width === tile.width && backing.height === tile.height) {
            realizedCrayonBackings++;
            countBacking(backing);
          }
        }
      }
      return {
        backingMigrationPending,
        liveSurfaceElements,
        realizedNormalBackings,
        realizedCrayonBackings,
        maxLiveBackingBytes,
        totalLiveBackingBytes,
        lastCommand: lastCommand ? { ...lastCommand } : null,
      };
    },
  };
}
