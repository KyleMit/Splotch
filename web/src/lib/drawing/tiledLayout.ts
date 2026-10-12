import { LIVE_TILE_COLUMNS, LIVE_TILE_ROWS } from './liveTiles';
import * as geo from './tiledGeometry';
import {
  ensureCrayonTileBacking,
  ensureNormalTileBacking,
  liveTileSurfaces,
  type LiveTile,
} from './tiledSurfaces';

export function layoutLiveTiles(
  tiles: readonly LiveTile[],
  width: number,
  height: number,
  renderScale: number,
  deferHiddenBackings: boolean
) {
  const totalCssWidth = width / renderScale;
  const totalCssHeight = height / renderScale;
  const deviceScale = window.devicePixelRatio || 1;
  for (let row = 0; row < LIVE_TILE_ROWS; row++) {
    for (let column = 0; column < LIVE_TILE_COLUMNS; column++) {
      const tile = tiles[row * LIVE_TILE_COLUMNS + column];
      if (!tile) continue;
      tile.x = Math.floor((column * width) / LIVE_TILE_COLUMNS);
      tile.y = Math.floor((row * height) / LIVE_TILE_ROWS);
      const right = Math.floor(((column + 1) * width) / LIVE_TILE_COLUMNS);
      const bottom = Math.floor(((row + 1) * height) / LIVE_TILE_ROWS);
      const horizontal = geo.tileCssSpan(column, LIVE_TILE_COLUMNS, totalCssWidth, deviceScale);
      const vertical = geo.tileCssSpan(row, LIVE_TILE_ROWS, totalCssHeight, deviceScale);
      const crayonWasVisible = !tile.crayonBottom.hidden || !tile.crayonTop.hidden;
      tile.width = right - tile.x;
      tile.height = bottom - tile.y;
      // The size this tile's backing store is meant to have, published for
      // compositeVisibleLiveTiles: a hidden tile's own backing lags this by
      // design (createHiddenBackingMigration re-sizes one tile per frame),
      // so a composite measured off the backings alone mis-sizes any row or
      // column whose tiles are all hidden and shifts every later one. That
      // reader is serialized into the page and can import neither the attribute
      // name nor its units — backing pixels, which part company with CSS pixels
      // wherever renderScale is above 1 — so `tiledRendererContract.test.ts`
      // drives a real resize through the real composite to catch either drift.
      tile.canvas.dataset.tileBacking = `${tile.width}x${tile.height}`;
      tile.canvas.hidden = true;
      tile.crayonBottom.hidden = true;
      tile.crayonTop.hidden = true;
      if (!deferHiddenBackings || !tile.canvas.hidden) ensureNormalTileBacking(tile);
      for (const tileCanvas of liveTileSurfaces(tile)) {
        tileCanvas.style.left = `${horizontal.start}px`;
        tileCanvas.style.top = `${vertical.start}px`;
        tileCanvas.style.width = `${horizontal.size}px`;
        tileCanvas.style.height = `${vertical.size}px`;
      }
      tile.ctx.lineCap = 'round';
      tile.ctx.lineJoin = 'round';
      if (crayonWasVisible) ensureCrayonTileBacking(tile);
    }
  }
}

export function createHiddenBackingMigration(getTiles: () => readonly LiveTile[]) {
  let revision = 0;
  let pending = false;

  function start() {
    const startedRevision = ++revision;
    pending = true;
    let index = 0;
    const migrateNext = () => {
      if (startedRevision !== revision) return;
      const tiles = getTiles();
      const tile = tiles[index++];
      if (tile?.canvas.hidden) ensureNormalTileBacking(tile);
      if (index < tiles.length) requestAnimationFrame(migrateNext);
      else pending = false;
    };
    requestAnimationFrame(migrateNext);
  }

  function cancel() {
    revision++;
    pending = false;
  }

  return { start, cancel, pending: () => pending };
}
