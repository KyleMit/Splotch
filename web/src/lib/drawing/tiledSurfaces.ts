import { resetCrayonStateForClear, setCrayonBufferForTarget } from './crayonPassBuffer';
import { setMagicPatternRegion } from './magicBrush';
import { LIVE_TILE_COLUMNS, LIVE_TILE_ROWS } from './liveTiles';
import { clearAllOf } from './strokeOps';
import type { TileBounds } from './tiledGeometry';

export interface LiveTile extends TileBounds {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  crayonBottom: HTMLCanvasElement;
  crayonBottomCtx: CanvasRenderingContext2D;
  crayonTop: HTMLCanvasElement;
  crayonTopCtx: CanvasRenderingContext2D;
  needsClear: boolean;
}

export interface HistoryBaseTile extends TileBounds {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createLiveTiles(canvasElement: HTMLCanvasElement): LiveTile[] {
  const elements =
    canvasElement.parentElement?.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]') ??
    [];
  const crayonBottoms =
    canvasElement.parentElement?.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-live-crayon-bottom]'
    ) ?? [];
  const crayonTops =
    canvasElement.parentElement?.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-live-crayon-top]'
    ) ?? [];
  const tiles = Array.from(elements, (tileCanvas, index) => ({
    canvas: tileCanvas,
    ctx: tileCanvas.getContext('2d')!,
    crayonBottom: crayonBottoms[index],
    crayonBottomCtx: crayonBottoms[index].getContext('2d')!,
    crayonTop: crayonTops[index],
    crayonTopCtx: crayonTops[index].getContext('2d')!,
    needsClear: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    paperLeft: 0,
    paperTop: 0,
    paperRight: 0,
    paperBottom: 0,
  }));
  for (const tile of tiles) {
    tile.crayonBottomCtx.lineCap = 'round';
    tile.crayonBottomCtx.lineJoin = 'round';
    tile.crayonTopCtx.lineCap = 'round';
    tile.crayonTopCtx.lineJoin = 'round';
    setCrayonBufferForTarget(tile.ctx, tile.crayonBottomCtx, tile.crayonTopCtx);
  }
  return tiles;
}

function resizeBacking(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export function ensureNormalTileBacking(tile: LiveTile) {
  if (tile.canvas.width === tile.width && tile.canvas.height === tile.height) return;
  const transform = tile.ctx.getTransform();
  resizeBacking(tile.canvas, tile.width, tile.height);
  tile.ctx.lineCap = 'round';
  tile.ctx.lineJoin = 'round';
  tile.ctx.setTransform(transform);
  tile.needsClear = false;
}

export function ensureCrayonTileBacking(tile: LiveTile) {
  const correctlySized =
    tile.crayonBottom.width === tile.width &&
    tile.crayonBottom.height === tile.height &&
    tile.crayonTop.width === tile.width &&
    tile.crayonTop.height === tile.height;
  if (correctlySized) return;
  resizeBacking(tile.crayonBottom, tile.width, tile.height);
  resizeBacking(tile.crayonTop, tile.width, tile.height);
  tile.crayonBottomCtx.lineCap = 'round';
  tile.crayonBottomCtx.lineJoin = 'round';
  tile.crayonTopCtx.lineCap = 'round';
  tile.crayonTopCtx.lineJoin = 'round';
  setCrayonBufferForTarget(tile.ctx, tile.crayonBottomCtx, tile.crayonTopCtx);
}

export function clearTileBacking(tile: LiveTile) {
  resetCrayonStateForClear(tile.ctx);
  clearAllOf(tile.ctx);
  tile.needsClear = false;
}

export function deferHiddenTileClear(tile: LiveTile) {
  tile.needsClear = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (tile.needsClear && tile.canvas.hidden) clearTileBacking(tile);
    });
  });
}

export function createHistoryBaseTiles(width: number, height: number): HistoryBaseTile[] {
  const tiles: HistoryBaseTile[] = [];
  for (let row = 0; row < LIVE_TILE_ROWS; row++) {
    for (let column = 0; column < LIVE_TILE_COLUMNS; column++) {
      const x = Math.floor((column * width) / LIVE_TILE_COLUMNS);
      const y = Math.floor((row * height) / LIVE_TILE_ROWS);
      const right = Math.floor(((column + 1) * width) / LIVE_TILE_COLUMNS);
      const bottom = Math.floor(((row + 1) * height) / LIVE_TILE_ROWS);
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = right - x;
      baseCanvas.height = bottom - y;
      const baseCtx = baseCanvas.getContext('2d')!;
      baseCtx.lineCap = 'round';
      baseCtx.lineJoin = 'round';
      baseCtx.setTransform(1, 0, 0, 1, -x, -y);
      const tile = {
        canvas: baseCanvas,
        ctx: baseCtx,
        x,
        y,
        width: baseCanvas.width,
        height: baseCanvas.height,
        paperLeft: x,
        paperTop: y,
        paperRight: right,
        paperBottom: bottom,
      };
      setMagicPatternRegion(baseCtx, { x, y, width: tile.width, height: tile.height });
      tiles.push(tile);
    }
  }
  return tiles;
}
