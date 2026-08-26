import { resetCrayonStateForClear, setCrayonBufferForTarget } from './crayonPassBuffer';
import { setMagicPatternRegion } from './magicBrush';
import { LIVE_TILE_COLUMNS, LIVE_TILE_COUNT, LIVE_TILE_ROWS } from './liveTiles';
import { viewMatrix, viewToPaper, type PaperView } from './paperView';
import { clearAllOf, renderOp, type StrokeOp } from './strokeOps';
import { geometryIntersectsTile, tilesIntersect, type TileBounds } from './tiledGeometry';

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
  painted: boolean;
}

export interface TiledCanvasSnapshot {
  width: number;
  height: number;
  tiles: Array<{ bitmap: Promise<ImageBitmap>; x: number; y: number }>;
}

export function liveTileSurfaces(tile: LiveTile) {
  return [tile.canvas, tile.crayonBottom, tile.crayonTop] as const;
}

function contextIsLost(context: CanvasRenderingContext2D) {
  if (typeof context.isContextLost !== 'function') return false;
  try {
    return context.isContextLost();
  } catch {
    return false;
  }
}

export function liveTileContextsAreLost(tiles: readonly LiveTile[]) {
  return tiles.some((tile) =>
    [tile.ctx, tile.crayonBottomCtx, tile.crayonTopCtx].some(contextIsLost)
  );
}

export function liveTileContextsNeedRecovery(tiles: readonly LiveTile[]) {
  return tiles.some((tile) => {
    const transform = tile.ctx.getTransform();
    return (
      tile.ctx.lineCap !== 'round' ||
      tile.ctx.lineJoin !== 'round' ||
      tile.crayonBottomCtx.lineCap !== 'round' ||
      tile.crayonBottomCtx.lineJoin !== 'round' ||
      tile.crayonTopCtx.lineCap !== 'round' ||
      tile.crayonTopCtx.lineJoin !== 'round' ||
      transform.a !== 1 ||
      transform.b !== 0 ||
      transform.c !== 0 ||
      transform.d !== 1 ||
      transform.e !== -tile.x ||
      transform.f !== -tile.y
    );
  });
}

export function historyBaseContextsAreLost(tiles: readonly HistoryBaseTile[]) {
  return tiles.some((tile) => contextIsLost(tile.ctx));
}

export function historyBaseContextsNeedRecovery(tiles: readonly HistoryBaseTile[]) {
  return tiles.some((tile) => {
    const transform = tile.ctx.getTransform();
    return (
      tile.ctx.lineCap !== 'round' ||
      tile.ctx.lineJoin !== 'round' ||
      transform.a !== 1 ||
      transform.b !== 0 ||
      transform.c !== 0 ||
      transform.d !== 1 ||
      transform.e !== -tile.x ||
      transform.f !== -tile.y
    );
  });
}

export function rebindLiveTileContexts(tiles: readonly LiveTile[]) {
  for (const tile of tiles) {
    const context = tile.canvas.getContext('2d');
    const crayonBottomContext = tile.crayonBottom.getContext('2d');
    const crayonTopContext = tile.crayonTop.getContext('2d');
    if (!context || !crayonBottomContext || !crayonTopContext) return false;
    tile.ctx = context;
    tile.crayonBottomCtx = crayonBottomContext;
    tile.crayonTopCtx = crayonTopContext;
    for (const surfaceContext of [context, crayonBottomContext, crayonTopContext]) {
      surfaceContext.lineCap = 'round';
      surfaceContext.lineJoin = 'round';
    }
    setCrayonBufferForTarget(context, crayonBottomContext, crayonTopContext);
  }
  return true;
}

export function rebindHistoryBaseContexts(tiles: readonly HistoryBaseTile[]) {
  for (const tile of tiles) {
    const context = tile.canvas.getContext('2d');
    if (!context) return false;
    tile.ctx = context;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.setTransform(1, 0, 0, 1, -tile.x, -tile.y);
    setMagicPatternRegion(context, {
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    });
  }
  return true;
}

export function applyLiveTileView(tiles: readonly LiveTile[], paperView: PaperView) {
  const [a, b, c, d, e, f] = viewMatrix(paperView);
  for (const tile of tiles) {
    tile.ctx.setTransform(a, b, c, d, e - tile.x, f - tile.y);
    const topLeft = viewToPaper(paperView, tile.x, tile.y);
    const topRight = viewToPaper(paperView, tile.x + tile.width, tile.y);
    const bottomLeft = viewToPaper(paperView, tile.x, tile.y + tile.height);
    const bottomRight = viewToPaper(paperView, tile.x + tile.width, tile.y + tile.height);
    tile.paperLeft = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    tile.paperTop = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    tile.paperRight = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    tile.paperBottom = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    const patternX = Math.floor(tile.paperLeft);
    const patternY = Math.floor(tile.paperTop);
    setMagicPatternRegion(tile.ctx, {
      x: patternX,
      y: patternY,
      width: Math.ceil(tile.paperRight) - patternX,
      height: Math.ceil(tile.paperBottom) - patternY,
    });
  }
}

type TileWithContext = Pick<LiveTile, 'ctx'>;

export function clipTilesToPaper(
  tiles: readonly TileWithContext[],
  paper: { width: number; height: number }
) {
  for (const tile of tiles) {
    tile.ctx.save();
    tile.ctx.beginPath();
    tile.ctx.rect(0, 0, paper.width, paper.height);
    tile.ctx.clip();
  }
}

export function restoreTileContexts(tiles: readonly TileWithContext[]) {
  for (const tile of tiles) tile.ctx.restore();
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
  if (
    elements.length !== LIVE_TILE_COUNT ||
    crayonBottoms.length !== elements.length ||
    crayonTops.length !== elements.length
  ) {
    throw new Error('Drawing engine live surface markup is missing or incomplete');
  }
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

export function restoreBlankLiveTiles(tiles: readonly LiveTile[]) {
  for (const tile of tiles) {
    const wasVisible = !tile.canvas.hidden;
    tile.canvas.hidden = true;
    // EXPERIMENT (exp/crayon-i6-persistent-planes): planes stay visible.
    if (wasVisible) tile.needsClear = true;
  }
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
        painted: false,
      };
      setMagicPatternRegion(baseCtx, { x, y, width: tile.width, height: tile.height });
      tiles.push(tile);
    }
  }
  return tiles;
}

export function cloneHistoryBaseTiles(
  source: readonly HistoryBaseTile[],
  width: number,
  height: number
) {
  const copy = createHistoryBaseTiles(width, height);
  for (const target of copy) {
    for (const sourceTile of source) {
      if (!sourceTile.painted || !tilesIntersect(sourceTile, target)) continue;
      target.ctx.drawImage(sourceTile.canvas, sourceTile.x, sourceTile.y);
      target.painted = true;
    }
  }
  return copy;
}

export function renderHistoryBaseOp(tiles: HistoryBaseTile[], op: StrokeOp) {
  if (op.kind === 'clear') {
    for (const tile of tiles) {
      renderOp(tile.ctx, op);
      tile.painted = false;
    }
    return;
  }
  if (op.kind === 'crayonFlush') {
    for (const tile of tiles) renderOp(tile.ctx, op);
    return;
  }
  for (const tile of tiles) {
    if (!geometryIntersectsTile(op, tile)) continue;
    renderOp(tile.ctx, op);
    if (!op.erase) tile.painted = true;
  }
}
