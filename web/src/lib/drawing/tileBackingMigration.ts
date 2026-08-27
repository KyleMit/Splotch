// Hidden live tiles defer their backing-store resize; this walks them one
// per animation frame after a deferred-backing resize (ADR-0089), so blank
// paper never pays sixteen reallocations in one frame. A new revision —
// another resize, a repaint, a migration start — abandons any walk in
// flight.
import { ensureNormalTileBacking, type LiveTile } from './tiledSurfaces';

export function createBackingMigration(tiles: () => readonly LiveTile[]) {
  let revision = 0;
  let pending = false;

  function migrate() {
    revision += 1;
    const walkRevision = revision;
    pending = true;
    let index = 0;
    const migrateNext = () => {
      if (walkRevision !== revision) return;
      const tile = tiles()[index++];
      if (tile?.canvas.hidden) ensureNormalTileBacking(tile);
      if (index < tiles().length) {
        requestAnimationFrame(migrateNext);
      } else pending = false;
    };
    requestAnimationFrame(migrateNext);
  }

  function invalidate() {
    revision += 1;
    pending = false;
  }

  return { migrate, invalidate, pending: () => pending };
}
