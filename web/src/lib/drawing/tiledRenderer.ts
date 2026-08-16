import { crayonBufferIsDirty, resetCrayonStateForClear } from './crayonPassBuffer';
import { createDrawingWorkCounters } from './drawingWorkDebug';
import { scanCanvasIsEmpty } from './emptyScan';
import type { MagicSheetSnapshot } from './magicBrush';
import type { PaperView } from './paperView';
import { createProgressiveClearCapture } from './progressiveClearCapture';
import { renderOp, type StrokeGroupCommand, type StrokeOp } from './strokeOps';
import { MAX_UNDO_DEPTH } from './undoHistory';
import {
  geometryIntersectsTile,
  opDeviceBounds,
  tileCssSpan,
  tilesIntersect,
} from './tiledGeometry';
import { LIVE_TILE_COLUMNS, LIVE_TILE_ROWS } from './liveTiles';
import { createTiledUndoPatches } from './tiledUndoPatches';
import { createTiledMagicRecode } from './tiledMagicRecode';
import {
  clearTileBacking,
  clipTilesToPaper,
  cloneHistoryBaseTiles,
  createHistoryBaseTiles,
  createLiveTiles,
  applyLiveTileView,
  deferHiddenTileClear,
  ensureCrayonTileBacking,
  ensureNormalTileBacking,
  liveTileSurfaces,
  renderHistoryBaseOp,
  restoreBlankLiveTiles,
  restoreTileContexts,
  type HistoryBaseTile,
  type LiveTile,
  type TiledCanvasSnapshot,
} from './tiledSurfaces';
import {
  buildTiledHistoryDebug,
  captureTiledCanvasReadback,
  renderTiledReadback,
} from './tiledRendererReadback';

interface TiledRendererHost {
  paperSize: () => { width: number; height: number } | null;
  hasActivePointers: () => boolean;
}

export const TILE_HISTORY_FOLD_IDLE_MS = 1_500;
// Six papers is the smallest whole-paper budget that retained all twenty
// trusted large sweeps on the target iPad; see ADR-0086.
export const TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE = 6;
export const MIN_TILED_UNDO_COMMANDS = 2;

let canvas: HTMLCanvasElement | null = null;
let host: TiledRendererHost | null = null;
let liveTiles: LiveTile[] = [];
let rendererWidth = 0;
let rendererHeight = 0;
let rendererScale = 0;
let historyBase: HistoryBaseTile[] = [];
let historyBaseWidth = 0;
let historyBaseHeight = 0;
let activeCommand: StrokeGroupCommand | null = null;
const history: StrokeGroupCommand[] = [];
const undoPatches = createTiledUndoPatches();
let undoableCommands = 0;
let historyFoldTimer: ReturnType<typeof setTimeout> | null = null;
let backingMigration = { revision: 0, pending: false };
const isDevHarness = typeof __DEV_HARNESS__ !== 'undefined' && __DEV_HARNESS__;
const workCounters = import.meta.env?.DEV || isDevHarness ? createDrawingWorkCounters() : null;

export function adoptTiledRenderer(
  canvasElement: HTMLCanvasElement,
  rendererHost: TiledRendererHost
) {
  canvas = canvasElement;
  host = rendererHost;
  liveTiles = createLiveTiles(canvasElement);
}

export function tiledSurfaceTopologyDebug() {
  return liveTiles.map(({ width, height }) => ({ width, height }));
}

export function syncTiledCrayonMix(opacity: string) {
  for (const tile of liveTiles) tile.crayonTop.style.opacity = opacity;
}

function migrateHiddenBackingsAcrossFrames() {
  const revision = backingMigration.revision + 1;
  backingMigration = { revision, pending: true };
  let index = 0;
  const migrateNext = () => {
    if (revision !== backingMigration.revision) return;
    const tile = liveTiles[index++];
    if (tile?.canvas.hidden) ensureNormalTileBacking(tile);
    if (index < liveTiles.length) {
      requestAnimationFrame(migrateNext);
    } else backingMigration.pending = false;
  };
  requestAnimationFrame(migrateNext);
}

export function resizeTiledRenderer(
  width: number,
  height: number,
  renderScale: number,
  deferHiddenBackings = false
) {
  if (!canvas) return false;
  if (rendererWidth === width && rendererHeight === height && rendererScale === renderScale) {
    return false;
  }
  clearCapture.resolve();
  rendererWidth = width;
  rendererHeight = height;
  rendererScale = renderScale;
  const totalCssWidth = width / renderScale;
  const totalCssHeight = height / renderScale;
  const deviceScale = window.devicePixelRatio || 1;
  for (let row = 0; row < LIVE_TILE_ROWS; row++) {
    for (let column = 0; column < LIVE_TILE_COLUMNS; column++) {
      const tile = liveTiles[row * LIVE_TILE_COLUMNS + column];
      if (!tile) continue;
      tile.x = Math.floor((column * width) / LIVE_TILE_COLUMNS);
      tile.y = Math.floor((row * height) / LIVE_TILE_ROWS);
      const right = Math.floor(((column + 1) * width) / LIVE_TILE_COLUMNS);
      const bottom = Math.floor(((row + 1) * height) / LIVE_TILE_ROWS);
      const horizontal = tileCssSpan(column, LIVE_TILE_COLUMNS, totalCssWidth, deviceScale);
      const vertical = tileCssSpan(row, LIVE_TILE_ROWS, totalCssHeight, deviceScale);
      const crayonWasVisible = !tile.crayonBottom.hidden || !tile.crayonTop.hidden;
      tile.width = right - tile.x;
      tile.height = bottom - tile.y;
      // The size this tile's backing store is meant to have, published for
      // compositeVisibleLiveTiles: a hidden tile's own backing lags this by
      // design (migrateHiddenBackingsAcrossFrames re-sizes one tile per frame),
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
  if (historyBase.length > 0) ensureHistoryBase();
  if (deferHiddenBackings) migrateHiddenBackingsAcrossFrames();
  else backingMigration = { revision: backingMigration.revision + 1, pending: false };
  return true;
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
      if (source.painted && tilesIntersect(source, target)) {
        target.ctx.drawImage(source.canvas, source.x, source.y);
        target.painted = true;
      }
    }
  }
}

const magicRecode = createTiledMagicRecode<HistoryBaseTile>({
  history: () => history,
  activeCommand: () => activeCommand,
  canBeginUndo: () => activeCommand === null && !host?.hasActivePointers(),
  currentBase: () => historyBase,
  cloneBase: (source) => cloneHistoryBaseTiles(source, historyBaseWidth, historyBaseHeight),
  rebuildBase: (baseline, tail) => {
    historyBase = cloneHistoryBaseTiles(baseline, historyBaseWidth, historyBaseHeight);
    const paper = host?.paperSize();
    if (!paper) return;
    clipTilesToPaper(historyBase, paper);
    for (const command of tail) {
      for (const op of command.ops) renderHistoryBaseOp(historyBase, op);
    }
    restoreTileContexts(historyBase);
  },
  commitUndo: (command) => {
    cancelHistoryFold();
    // A recode changes existing pixels rather than adding geometry, so its undo
    // patch is the complete visible paper state (ADR-0121).
    for (const [index, tile] of liveTiles.entries()) {
      if (!tile.canvas.hidden) undoPatches.capture(command, tile, index);
    }
    history.push(command);
    undoableCommands = Math.min(MAX_UNDO_DEPTH, undoableCommands + 1);
    enforceUndoPatchBudget();
    scheduleTiledHistoryFold();
  },
  repaint: (preserveUndoThrough) => repaintTiledRenderer(true, preserveUndoThrough),
});

export const hasRetainedTiledMagicOps = magicRecode.hasRetainedOps;

export function applyTiledView(paperView: PaperView) {
  applyLiveTileView(liveTiles, paperView);
}

function enforceUndoPatchBudget() {
  for (const command of history.slice(0, -undoableCommands)) {
    undoPatches.delete(command);
  }
  const budget =
    liveTiles.reduce((total, tile) => total + tile.width * tile.height * 4, 0) *
    TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE;
  let bytes = history
    .slice(-undoableCommands)
    .reduce((total, command) => total + undoPatches.bytes(command), 0);
  while (undoableCommands > MIN_TILED_UNDO_COMMANDS && bytes > budget) {
    const command = history[history.length - undoableCommands];
    bytes -= undoPatches.bytes(command);
    undoPatches.delete(command);
    undoableCommands--;
  }
}

const clearCapture = createProgressiveClearCapture<StrokeGroupCommand>({
  tileCount: () => liveTiles.length,
  capture(command, index) {
    const tile = liveTiles[index];
    if (!tile) return false;
    undoPatches.capture(command, tile, index, undefined, false);
    deferHiddenTileClear(tile);
    return true;
  },
  onComplete: enforceUndoPatchBudget,
});

function prepareTileForMutation(tile: LiveTile, index: number) {
  if (!tile.needsClear) return;
  clearCapture.captureBeforeMutation(index);
  clearTileBacking(tile);
}

function showTileForOp(tile: LiveTile, op: StrokeOp) {
  if (op.kind === 'clear') {
    tile.canvas.hidden = true;
    tile.needsClear = false;
    return;
  }
  if ((op.kind === 'dot' || op.kind === 'path') && op.crayon && !op.erase) return;
  if (op.kind === 'crayonFlush' && !crayonBufferIsDirty(tile.ctx)) return;
  tile.canvas.hidden = false;
}

function renderTiledOpForCommand(op: StrokeOp, command: StrokeGroupCommand | null) {
  let surfaceVisits = 0;
  if (op.kind !== 'dot' && op.kind !== 'path') {
    for (const [index, tile] of liveTiles.entries()) {
      if (op.kind !== 'crayonFlush' || crayonBufferIsDirty(tile.ctx)) {
        ensureNormalTileBacking(tile);
      }
      prepareTileForMutation(tile, index);
      if (command && !command.wasEmpty && op.kind !== 'crayonFlush') {
        undoPatches.capture(command, tile, index);
      }
      showTileForOp(tile, op);
      renderOp(tile.ctx, op);
      if (workCounters) surfaceVisits++;
    }
  } else {
    for (const [index, tile] of liveTiles.entries()) {
      if (geometryIntersectsTile(op, tile)) {
        ensureNormalTileBacking(tile);
        if (op.crayon && !op.erase) ensureCrayonTileBacking(tile);
        prepareTileForMutation(tile, index);
        if (command && !command.wasEmpty) {
          undoPatches.capture(command, tile, index, opDeviceBounds(tile, op));
        }
        showTileForOp(tile, op);
        renderOp(tile.ctx, op);
        if (workCounters) surfaceVisits++;
      }
    }
  }
  if (workCounters && command === activeCommand) workCounters.record(surfaceVisits);
}

export function renderTiledOp(op: StrokeOp) {
  renderTiledOpForCommand(op, activeCommand);
}

export function recordTiledOp(op: StrokeOp) {
  activeCommand?.ops.push(op);
}

function renderCommandAcrossTiles(command: StrokeGroupCommand, captureUndo = false) {
  const paper = host?.paperSize();
  if (!paper) return;
  clipTilesToPaper(liveTiles, paper);
  for (const op of command.ops) {
    renderTiledOpForCommand(op, captureUndo ? command : null);
  }
  restoreTileContexts(liveTiles);
  if (captureUndo) undoPatches.crop(command);
}

function foldOldestCommand() {
  const paper = host?.paperSize();
  if (!paper || paper.width <= 0 || paper.height <= 0) return;
  const command = history.shift();
  if (!command) return;
  undoPatches.delete(command);
  ensureHistoryBase();
  magicRecode.beforeFold(command);
  clipTilesToPaper(historyBase, paper);
  for (const op of command.ops) renderHistoryBaseOp(historyBase, op);
  restoreTileContexts(historyBase);
  magicRecode.afterFold(command);
}

function cancelHistoryFold() {
  if (historyFoldTimer === null) return;
  clearTimeout(historyFoldTimer);
  historyFoldTimer = null;
}

export function scheduleTiledHistoryFold() {
  cancelHistoryFold();
  if (history.length <= undoableCommands) return;
  historyFoldTimer = setTimeout(() => {
    historyFoldTimer = null;
    if (host?.hasActivePointers() || history.length <= undoableCommands) return;
    foldOldestCommand();
    scheduleTiledHistoryFold();
  }, TILE_HISTORY_FOLD_IDLE_MS);
}

export function repaintTiledRenderer(
  rebuildUndoPatches = true,
  preserveUndoThrough: StrokeGroupCommand | null = null
) {
  clearCapture.cancel();
  const undoableStart = history.length - undoableCommands;
  const preserveUndoThroughIndex = preserveUndoThrough ? history.indexOf(preserveUndoThrough) : -1;
  const rebuildUndo = rebuildUndoPatches && (undoableCommands > 0 || activeCommand !== null);
  for (const tile of liveTiles) {
    ensureNormalTileBacking(tile);
    tile.canvas.hidden = true;
    clearTileBacking(tile);
    for (const base of historyBase) {
      if (base.painted && tilesIntersect(base, tile)) {
        tile.ctx.drawImage(base.canvas, base.x, base.y);
        tile.canvas.hidden = false;
      }
    }
  }
  for (const [index, command] of history.entries()) {
    const preserveExistingUndo =
      command.magicRecode?.applied === true ||
      (preserveUndoThroughIndex >= 0 && index <= preserveUndoThroughIndex);
    const captureUndo = rebuildUndo && index >= undoableStart && !preserveExistingUndo;
    if (rebuildUndo && !preserveExistingUndo) undoPatches.delete(command);
    renderCommandAcrossTiles(command, captureUndo);
  }
  if (activeCommand) {
    workCounters?.begin();
    if (rebuildUndo) undoPatches.delete(activeCommand);
    for (const op of activeCommand.ops) renderTiledOp(op);
  }
  if (rebuildUndo) enforceUndoPatchBudget();
}

export function beginTiledMagicRecode(
  targetSourceKey: string | null,
  restoreAppearance: () => void
) {
  return magicRecode.beginUndo(targetSourceKey, restoreAppearance);
}

export function recodeTiledMagicOps(snapshot: MagicSheetSnapshot, sourceKey: string | null) {
  return magicRecode.recode(snapshot, sourceKey);
}

export function beginTiledCommand(wasEmpty: boolean) {
  cancelHistoryFold();
  activeCommand = { ops: [], wasEmpty };
  workCounters?.begin();
}

export function commitTiledCommand() {
  if (!activeCommand) return false;
  undoPatches.crop(activeCommand);
  history.push(activeCommand);
  undoableCommands = Math.min(MAX_UNDO_DEPTH, undoableCommands + 1);
  enforceUndoPatchBudget();
  activeCommand = null;
  workCounters?.commit();
  scheduleTiledHistoryFold();
  return true;
}

export function undoTiledCommand(renderScale: number) {
  const undone = history.pop();
  undoableCommands = Math.max(0, undoableCommands - 1);
  magicRecode.restore(undone);
  if (undone && activeCommand) activeCommand.wasEmpty = undone.wasEmpty;
  const pendingIndices = undone ? clearCapture.takePendingIndices(undone) : [];
  const snapshots = undone && undoPatches.get(undone);
  const snapshotsFit =
    (snapshots || pendingIndices.length > 0) &&
    [...(snapshots ?? [])].every(([index, snapshot]) => {
      const tile = liveTiles[index];
      return snapshot.tileWidth === tile?.width && snapshot.tileHeight === tile?.height;
    });
  if (undone?.wasEmpty && !activeCommand) {
    restoreBlankLiveTiles(liveTiles);
  } else if (snapshotsFit && !activeCommand) {
    for (const [index, snapshot] of snapshots ?? []) {
      const tile = liveTiles[index];
      prepareTileForMutation(tile, index);
      resetCrayonStateForClear(tile.ctx);
      tile.ctx.save();
      tile.ctx.setTransform(1, 0, 0, 1, 0, 0);
      tile.ctx.clearRect(snapshot.x, snapshot.y, snapshot.canvas.width, snapshot.canvas.height);
      tile.ctx.drawImage(snapshot.canvas, snapshot.x, snapshot.y);
      tile.ctx.restore();
      tile.needsClear = false;
      tile.canvas.hidden = snapshot.hidden;
    }
    for (const index of pendingIndices) {
      const tile = liveTiles[index];
      tile.needsClear = false;
      tile.canvas.hidden = false;
    }
  } else {
    repaintTiledRenderer(activeCommand !== null || snapshots === undefined);
  }
  if (undone) undoPatches.delete(undone);
  const empty =
    undone && !host?.hasActivePointers() ? undone.wasEmpty : scanTiledRendererIsEmpty(renderScale);
  return {
    empty,
    canUndo: undoableCommands > 0,
    ...(undone?.magicRecode ? { restoreAppearance: undone.magicRecode.restoreAppearance } : {}),
  };
}

export function clearTiledRenderer(wasEmpty: boolean) {
  const clearCommand: StrokeGroupCommand = { ops: [{ kind: 'clear' }], wasEmpty };
  const captureIndices: number[] = [];
  history.push(clearCommand);
  undoableCommands = Math.min(MAX_UNDO_DEPTH, undoableCommands + 1);
  enforceUndoPatchBudget();
  scheduleTiledHistoryFold();
  for (const [index, tile] of liveTiles.entries()) {
    const wasVisible = !tile.canvas.hidden;
    if (!wasVisible && !crayonBufferIsDirty(tile.ctx)) continue;
    tile.canvas.hidden = true;
    tile.crayonBottom.hidden = true;
    tile.crayonTop.hidden = true;
    if (wasVisible) {
      tile.needsClear = true;
      captureIndices.push(index);
    } else {
      deferHiddenTileClear(tile);
    }
  }
  clearCapture.schedule(clearCommand, captureIndices);
  if (activeCommand) {
    undoPatches.delete(activeCommand);
    activeCommand.ops.length = 0;
    activeCommand.wasEmpty = true;
    workCounters?.begin();
  }
  return { empty: activeCommand === null, canUndo: true };
}

export function scanTiledRendererIsEmpty(renderScale: number) {
  return liveTiles.every(
    (tile) => tile.canvas.hidden || scanCanvasIsEmpty(tile.canvas, renderScale)
  );
}

export function hasUnresolvedTiledMagicOps() {
  const unresolved = (command: StrokeGroupCommand) =>
    command.ops.some(
      (op) => (op.kind === 'dot' || op.kind === 'path') && op.magic && !op.magicSheet
    );
  return history.some(unresolved) || (activeCommand ? unresolved(activeCommand) : false);
}

export function tiledHistoryDebug() {
  const undoSnapshots = history.map((command) => undoPatches.get(command));
  return buildTiledHistoryDebug({
    history,
    undoableCommands,
    undoSnapshots,
    baseTiles: [...historyBase, ...magicRecode.baseTiles()],
    strokeRevision: workCounters?.strokeRevision(),
    activeCommand,
  });
}

export const tiledWorkDebug = () =>
  workCounters?.debug(liveTiles, backingMigration.pending) ?? null;

export function captureTiledCanvasSnapshot(): TiledCanvasSnapshot | null {
  return captureTiledCanvasReadback({
    canvas,
    liveTiles,
    hasActivePointers: host?.hasActivePointers() ?? false,
    width: rendererWidth,
    height: rendererHeight,
  });
}

export function renderTiledSnapshot(target: CanvasRenderingContext2D) {
  renderTiledReadback(target, historyBase, history, activeCommand, host?.paperSize() ?? null);
}

export function detachTiledRenderer() {
  cancelHistoryFold();
  clearCapture.cancel();
  backingMigration = { revision: backingMigration.revision + 1, pending: false };
  canvas = null;
  host = null;
  liveTiles = [];
  rendererWidth = 0;
  rendererHeight = 0;
  rendererScale = 0;
  workCounters?.reset();
}
