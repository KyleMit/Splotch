import { IDENTITY_PAPER_VIEW } from './paperView';
import {
  applyLiveTileView,
  liveTileContextsAreLost,
  liveTileContextsNeedRecovery,
  liveTileSurfaces,
  rebindLiveTileContexts,
  type LiveTile,
} from './tiledSurfaces';

export function createLiveTileContextRecovery(repaint: () => void) {
  let tiles: readonly LiveTile[] = [];
  let pending = false;
  let recoveryFrame: number | null = null;
  let removers: Array<() => void> = [];

  function recoverIfNeeded() {
    if (tiles.length === 0) return false;
    if (liveTileContextsAreLost(tiles)) {
      pending = true;
      return false;
    }
    if (!pending && !liveTileContextsNeedRecovery(tiles)) return false;
    if (!rebindLiveTileContexts(tiles)) {
      pending = true;
      return false;
    }
    pending = false;
    applyLiveTileView(tiles, IDENTITY_PAPER_VIEW);
    repaint();
    applyLiveTileView(tiles, IDENTITY_PAPER_VIEW);
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
