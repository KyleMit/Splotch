import { resetCrayonStateForClear, setCrayonBufferForTarget } from './crayonPassBuffer';
import { scanCanvasIsEmpty } from './emptyScan';
import { setMagicPatternRegion, sheetPatternFor } from './magicBrush';
import { viewMatrix, viewToPaper, type PaperView } from './paperView';
import { clearAllOf, renderOp, type StrokeGroupCommand, type StrokeOp } from './strokeOps';
import { type HistoryDebug, MAX_UNDO_DEPTH } from './undoHistory';
import { LIVE_TILE_COLUMNS, LIVE_TILE_ROWS } from './liveTiles';

interface TileBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  paperLeft: number;
  paperTop: number;
  paperRight: number;
  paperBottom: number;
}

interface LiveTile extends TileBounds {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  crayonBottom: HTMLCanvasElement;
  crayonBottomCtx: CanvasRenderingContext2D;
  crayonTop: HTMLCanvasElement;
  crayonTopCtx: CanvasRenderingContext2D;
}

interface HistoryBaseTile extends TileBounds {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface TiledRendererHost {
  paperSize: () => { width: number; height: number };
  hasActivePointers: () => boolean;
}

const TILE_HISTORY_FOLD_IDLE_MS = 1_500;

let canvas: HTMLCanvasElement | null = null;
let host: TiledRendererHost | null = null;
let liveTiles: LiveTile[] = [];
let historyBase: HistoryBaseTile[] = [];
let historyBaseWidth = 0;
let historyBaseHeight = 0;
let activeCommand: StrokeGroupCommand | null = null;
const history: StrokeGroupCommand[] = [];
let undoableCommands = 0;
let historyFoldTimer: ReturnType<typeof setTimeout> | null = null;

export function adoptTiledRenderer(
  canvasElement: HTMLCanvasElement,
  rendererHost: TiledRendererHost
) {
  canvas = canvasElement;
  host = rendererHost;
  const elements =
    canvas.parentElement?.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]') ?? [];
  const crayonBottoms =
    canvas.parentElement?.querySelectorAll<HTMLCanvasElement>('canvas[data-live-crayon-bottom]') ??
    [];
  const crayonTops =
    canvas.parentElement?.querySelectorAll<HTMLCanvasElement>('canvas[data-live-crayon-top]') ?? [];
  liveTiles = Array.from(elements, (tileCanvas, index) => ({
    canvas: tileCanvas,
    ctx: tileCanvas.getContext('2d')!,
    crayonBottom: crayonBottoms[index],
    crayonBottomCtx: crayonBottoms[index].getContext('2d')!,
    crayonTop: crayonTops[index],
    crayonTopCtx: crayonTops[index].getContext('2d')!,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    paperLeft: 0,
    paperTop: 0,
    paperRight: 0,
    paperBottom: 0,
  }));
}

export function tiledRendererActive() {
  return liveTiles.length > 0;
}

export function syncTiledCrayonMix(opacity: string) {
  for (const tile of liveTiles) tile.crayonTop.style.opacity = opacity;
}

export function resizeTiledRenderer(renderScale: number) {
  if (!canvas) return;
  for (let row = 0; row < LIVE_TILE_ROWS; row++) {
    for (let column = 0; column < LIVE_TILE_COLUMNS; column++) {
      const tile = liveTiles[row * LIVE_TILE_COLUMNS + column];
      if (!tile) continue;
      tile.x = Math.floor((column * canvas.width) / LIVE_TILE_COLUMNS);
      tile.y = Math.floor((row * canvas.height) / LIVE_TILE_ROWS);
      const right = Math.floor(((column + 1) * canvas.width) / LIVE_TILE_COLUMNS);
      const bottom = Math.floor(((row + 1) * canvas.height) / LIVE_TILE_ROWS);
      tile.width = right - tile.x;
      tile.height = bottom - tile.y;
      for (const tileCanvas of [tile.canvas, tile.crayonBottom, tile.crayonTop]) {
        tileCanvas.width = tile.width;
        tileCanvas.height = tile.height;
        tileCanvas.style.left = `${tile.x / renderScale}px`;
        tileCanvas.style.top = `${tile.y / renderScale}px`;
        tileCanvas.style.width = `${tile.width / renderScale}px`;
        tileCanvas.style.height = `${tile.height / renderScale}px`;
      }
      for (const tileContext of [tile.ctx, tile.crayonBottomCtx, tile.crayonTopCtx]) {
        tileContext.lineCap = 'round';
        tileContext.lineJoin = 'round';
      }
      setCrayonBufferForTarget(tile.ctx, tile.crayonBottomCtx, tile.crayonTopCtx);
    }
  }
  if (historyBase.length > 0) ensureHistoryBase();
}

function createHistoryBaseTiles(width: number, height: number): HistoryBaseTile[] {
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

function ensureHistoryBase() {
  const paper = host?.paperSize();
  if (!paper) return;
  if (
    historyBase.length > 0 &&
    historyBaseWidth === paper.width &&
    historyBaseHeight === paper.height
  ) {
    return;
  }
  const previous = historyBase;
  historyBase = createHistoryBaseTiles(paper.width, paper.height);
  historyBaseWidth = paper.width;
  historyBaseHeight = paper.height;
  for (const target of historyBase) {
    for (const source of previous) {
      if (tilesIntersect(source, target)) {
        target.ctx.drawImage(source.canvas, source.x, source.y);
      }
    }
  }
}

export function applyTiledView(paperView: PaperView) {
  const [a, b, c, d, e, f] = viewMatrix(paperView);
  for (const tile of liveTiles) {
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

function geometryIntersectsTile(op: Extract<StrokeOp, { kind: 'dot' | 'path' }>, tile: TileBounds) {
  let left: number;
  let top: number;
  let right: number;
  let bottom: number;
  let padding: number;
  if (op.kind === 'dot') {
    left = right = op.x;
    top = bottom = op.y;
    padding = op.radius;
  } else {
    left = right = op.startX;
    top = bottom = op.startY;
    for (const segment of op.segs) {
      left = Math.min(left, segment.cx, segment.x);
      top = Math.min(top, segment.cy, segment.y);
      right = Math.max(right, segment.cx, segment.x);
      bottom = Math.max(bottom, segment.cy, segment.y);
    }
    padding = op.lineWidth / 2;
  }
  return (
    right + padding >= tile.paperLeft &&
    left - padding <= tile.paperRight &&
    bottom + padding >= tile.paperTop &&
    top - padding <= tile.paperBottom
  );
}

function tilesIntersect(first: TileBounds, second: TileBounds) {
  return (
    first.paperRight >= second.paperLeft &&
    first.paperLeft <= second.paperRight &&
    first.paperBottom >= second.paperTop &&
    first.paperTop <= second.paperBottom
  );
}

function renderHistoryBaseOp(op: StrokeOp) {
  if (op.kind !== 'dot' && op.kind !== 'path') {
    for (const tile of historyBase) renderOp(tile.ctx, op);
    return;
  }
  for (const tile of historyBase) {
    if (geometryIntersectsTile(op, tile)) renderOp(tile.ctx, op);
  }
}

export function renderTiledOp(op: StrokeOp) {
  if (op.kind !== 'dot' && op.kind !== 'path') {
    for (const tile of liveTiles) renderOp(tile.ctx, op);
    return;
  }
  for (const tile of liveTiles) {
    if (geometryIntersectsTile(op, tile)) renderOp(tile.ctx, op);
  }
}

export function recordTiledOp(op: StrokeOp) {
  activeCommand?.ops.push(op);
}

function renderHistoryCommand(target: CanvasRenderingContext2D, command: StrokeGroupCommand) {
  const paper = host?.paperSize();
  if (!paper) return;
  target.save();
  target.beginPath();
  target.rect(0, 0, paper.width, paper.height);
  target.clip();
  for (const op of command.ops) renderOp(target, op);
  target.restore();
}

function renderCommandAcrossTiles(command: StrokeGroupCommand) {
  const paper = host?.paperSize();
  if (!paper) return;
  for (const tile of liveTiles) {
    tile.ctx.save();
    tile.ctx.beginPath();
    tile.ctx.rect(0, 0, paper.width, paper.height);
    tile.ctx.clip();
  }
  for (const op of command.ops) renderTiledOp(op);
  for (const tile of liveTiles) tile.ctx.restore();
}

function foldOldestCommand() {
  const command = history.shift();
  const paper = host?.paperSize();
  if (!command || !paper) return;
  ensureHistoryBase();
  for (const tile of historyBase) {
    tile.ctx.save();
    tile.ctx.beginPath();
    tile.ctx.rect(0, 0, paper.width, paper.height);
    tile.ctx.clip();
  }
  for (const op of command.ops) renderHistoryBaseOp(op);
  for (const tile of historyBase) tile.ctx.restore();
}

function cancelHistoryFold() {
  if (historyFoldTimer === null) return;
  clearTimeout(historyFoldTimer);
  historyFoldTimer = null;
}

export function scheduleTiledHistoryFold() {
  cancelHistoryFold();
  if (history.length <= MAX_UNDO_DEPTH) return;
  historyFoldTimer = setTimeout(() => {
    historyFoldTimer = null;
    if (host?.hasActivePointers() || history.length <= MAX_UNDO_DEPTH) return;
    foldOldestCommand();
    scheduleTiledHistoryFold();
  }, TILE_HISTORY_FOLD_IDLE_MS);
}

export function repaintTiledRenderer() {
  for (const tile of liveTiles) {
    resetCrayonStateForClear(tile.ctx);
    clearAllOf(tile.ctx);
    for (const base of historyBase) {
      if (tilesIntersect(base, tile)) {
        tile.ctx.drawImage(base.canvas, base.x, base.y);
      }
    }
  }
  for (const command of history) renderCommandAcrossTiles(command);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderTiledOp(op);
  }
}

export function beginTiledCommand(wasEmpty: boolean) {
  cancelHistoryFold();
  activeCommand = { ops: [], wasEmpty };
}

export function commitTiledCommand() {
  if (!activeCommand) return false;
  history.push(activeCommand);
  undoableCommands = Math.min(MAX_UNDO_DEPTH, undoableCommands + 1);
  activeCommand = null;
  scheduleTiledHistoryFold();
  return true;
}

export function undoTiledCommand(renderScale: number) {
  history.pop();
  undoableCommands = Math.max(0, undoableCommands - 1);
  repaintTiledRenderer();
  return {
    empty: scanTiledRendererIsEmpty(renderScale),
    canUndo: undoableCommands > 0,
  };
}

export function clearTiledRenderer(wasEmpty: boolean) {
  const clearCommand: StrokeGroupCommand = { ops: [{ kind: 'clear' }], wasEmpty };
  history.push(clearCommand);
  undoableCommands = Math.min(MAX_UNDO_DEPTH, undoableCommands + 1);
  scheduleTiledHistoryFold();
  renderTiledOp(clearCommand.ops[0]);
  if (activeCommand) {
    activeCommand.ops.length = 0;
    activeCommand.wasEmpty = true;
  }
  return { empty: activeCommand === null, canUndo: true };
}

export function scanTiledRendererIsEmpty(renderScale: number) {
  return liveTiles.every((tile) => scanCanvasIsEmpty(tile.canvas, renderScale));
}

export function tiledHistoryDebug(): HistoryDebug {
  const rasterBytes = historyBase.reduce((total, tile) => total + tile.width * tile.height * 4, 0);
  return {
    snapshots: undoableCommands,
    liveRasters: historyBase.length,
    rasterBytes,
    blobBytes: 0,
    patchBytes: 0,
    pendingCommands: activeCommand ? 1 : 0,
  };
}

export function prewarmTiledMagicPatterns() {
  for (const tile of liveTiles) sheetPatternFor(tile.ctx);
}

export function renderTiledSnapshot(target: CanvasRenderingContext2D) {
  for (const base of historyBase) {
    target.drawImage(base.canvas, base.x, base.y);
  }
  for (const command of history) renderHistoryCommand(target, command);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(target, op);
  }
}

export function detachTiledRenderer() {
  cancelHistoryFold();
  canvas = null;
  host = null;
  liveTiles = [];
}
