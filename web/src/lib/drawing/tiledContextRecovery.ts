import { IDENTITY_PAPER_VIEW } from './paperView';
import {
  applyLiveTileView,
  historyBaseContextsAreLost,
  historyBaseContextsNeedRecovery,
  liveTileContextsAreLost,
  liveTileContextsNeedRecovery,
  liveTileSurfaces,
  rebindHistoryBaseContexts,
  rebindLiveTileContexts,
  type HistoryBaseTile,
  type LiveTile,
} from './tiledSurfaces';

export function createTiledContextRecovery(
  repaint: () => void,
  historyBaseTiles: () => readonly HistoryBaseTile[]
) {
  let tiles: readonly LiveTile[] = [];
  let pending = false;
  let recoveryFrame: number | null = null;
  let removers: Array<() => void> = [];

  function recoverIfNeeded(repaintRecoveredPixels = true) {
    if (tiles.length === 0) return false;
    const baseTiles = historyBaseTiles();
    if (liveTileContextsAreLost(tiles) || historyBaseContextsAreLost(baseTiles)) {
      pending = true;
      return false;
    }
    if (
      !pending &&
      !liveTileContextsNeedRecovery(tiles) &&
      !historyBaseContextsNeedRecovery(baseTiles)
    ) {
      return false;
    }
    if (!rebindLiveTileContexts(tiles) || !rebindHistoryBaseContexts(baseTiles)) {
      pending = true;
      return false;
    }
    pending = false;
    applyLiveTileView(tiles, IDENTITY_PAPER_VIEW);
    if (repaintRecoveredPixels) {
      repaint();
      applyLiveTileView(tiles, IDENTITY_PAPER_VIEW);
    }
    return true;
  }

  function scheduleRecovery() {
    if (recoveryFrame !== null) return;
    recoveryFrame = requestAnimationFrame(() => {
      recoveryFrame = null;
      recoverIfNeeded();
    });
  }

  function detach() {
    for (const remove of removers) remove();
    removers = [];
    pending = false;
    if (recoveryFrame !== null) cancelAnimationFrame(recoveryFrame);
    recoveryFrame = null;
    tiles = [];
  }

  function adopt(nextTiles: readonly LiveTile[]) {
    detach();
    tiles = nextTiles;
    for (const tile of tiles) {
      for (const surface of liveTileSurfaces(tile)) {
        const onContextLost = () => {
          pending = true;
        };
        const onContextRestored = () => {
          pending = true;
          scheduleRecovery();
        };
        surface.addEventListener('contextlost', onContextLost);
        surface.addEventListener('contextrestored', onContextRestored);
        removers.push(() => {
          surface.removeEventListener('contextlost', onContextLost);
          surface.removeEventListener('contextrestored', onContextRestored);
        });
      }
    }
  }

  return { adopt, recoverIfNeeded, detach };
}
