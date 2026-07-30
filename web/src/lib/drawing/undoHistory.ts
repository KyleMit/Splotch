// Undo history: a committed "paper" raster + a bounded stack of pre-stroke
// PATCH snapshots (ADR-0066 reversed ADR-0033's command replay; ADR-0069
// shrank the snapshots from full-paper copies to dirty-rect patches).
//
// The paper is one offscreen raster (a max(w,h) square) holding the committed
// drawing. Every commit captures the paper pixels under the region its fold
// is about to mutate — the padded bounding rect of the commands folding now —
// then folds the stroke's ops in. Undo blits the patch back over that rect;
// pixels outside it were untouched by that fold (or already reverted by later
// pops, the stack being LIFO), so the restore is byte-exact without a
// full-canvas copy. Resize, remount, and export stay whole-paper blits
// (repaintAll), never command replays. The capture cost at pointerup is one
// stroke-sized drawImage — a 'clear' instead swaps the whole paper out as its
// snapshot (see pushCommand) — which buys O(blit) undo at any stroke
// complexity and frees every brush from replay-determinism constraints
// (ADR-0065's crayon was the forcing case).
//
// Memory is tiered on top of that: snapshots stay hot rasters (patch-sized — a
// stroke's bounding rect, worst case the full ~30 MB paper at 2× DPR on a 13″
// iPad for a canvas-spanning scribble or a clear) while they fit a byte budget;
// entries past it encode to a lossless blob and decode again only on deep undo.
// The budget replaced a fixed hot-entry count because encoding is not free:
// toBlob honours its spec'd in-parallel encode in Chromium but blocks inside
// the call in WebKit, so a count encoded eagerly and charged every WebKit
// commit for memory the budget did not need. engine.encode measures that block,
// and the pass is scheduled off the commit either way. The tier re-balances in
// both directions: undo (or a commit on an undo-shallowed stack) can raise an
// encoded entry back inside the budget, and it re-inflates to a hot raster off
// the interaction path (reinflateHotSnapshots), so the window holds after
// undo-then-draw, not only while the stack grows.
//
// Commands are retained as ops (`pendingCommands`) only while the magic sheet
// is unready — folding a magic op then would bake its intentionally-blank
// pixels into the paper (see foldPendingIntoPaper).
//
// All of this state deliberately outlives the engine's teardown()/init cycles:
// client-side navigation (`/` → `/privacy` → `/`) must not wipe the child's
// drawing, so remount blits the paper back onto the fresh canvas. The cost —
// the rasters stay resident while no canvas is mounted — is accepted
// (ADR-0004).

import { clearAllOf, renderOp, type StrokeGroupCommand, type StrokeOp } from './strokeOps';
import { foldRegionsForCommands, type PaperRect } from './foldRegions';
import { resetCrayonStateForClear, resetLiveCrayonForReplay } from './crayonPassBuffer';
import { isMagicSheetUnready } from './magicBrush';
import { scheduleIdle } from '../idle';
import { PERF_MARKS } from './perf';

// The snapshot stack depth — how many strokes a child can take back. Depth 20
// keeps a child from hitting the wall mid-correction (raised from 10 after
// user feedback). Past the resident byte budget the per-entry cost is an
// encoded blob (single-digit MB even for crayon-heavy paper), so depth is
// bounded by bytes, not raster count. Exported as the depth-cap test seam.
export const MAX_UNDO_DEPTH = 20;

// The hot window is a byte budget, not an entry count. Entries stay resident
// rasters from newest backwards until their patches exhaust the budget;
// everything past it demotes to an encoded blob (encodeColdSnapshots), and a
// blob rising back inside re-inflates (reinflateHotSnapshots).
//
// It is a budget because encoding is not free the way ADR-0066 assumed. It
// costs a WebKit commit its entire frame budget — `toBlob` encodes
// synchronously inside the call there, and Safari has no canvas WebP encoder,
// so every patch is a PNG of the paper's raster size. Counting entries encodes
// eagerly whether or not the memory is needed; counting bytes encodes only when
// it is.
//
// The budget scales with the paper rather than being absolute, so it tracks
// device class: a bigger raster means a bigger device. At this multiple the
// resident tier plus the paper stays at 4× the paper — ~114 MiB on the largest
// iPad raster, inside ADR-0066's ≲150 MB gate with room for the encoded tail.
// Exported as the budget test seam — the tier suites derive their expected
// resident count from it rather than re-declaring a window size.
export const HOT_PATCH_BUDGET_PAPER_MULTIPLE = 3;

// Floor under the budget: the newest entries stay resident even if one patch is
// larger than the whole budget, so undo's first steps are always a blit rather
// than a decode.
const MIN_HOT_RASTERS = 2;

function patchBytesOf(snap: Snapshot): number {
  return snap.patches.reduce((n, p) => n + p.rect.w * p.rect.h * 4, 0);
}

// Index of the oldest snapshot that stays resident. Walks newest → oldest,
// accumulating patch bytes, and stops where the next entry would break the
// budget — never keeping fewer than MIN_HOT_RASTERS.
function hotWindowStart(): number {
  const paperBytes = paperCanvas ? paperCanvas.width * paperCanvas.height * 4 : 0;
  const budget = paperBytes * HOT_PATCH_BUDGET_PAPER_MULTIPLE;
  let bytes = 0;
  for (let i = snapshotStack.length - 1; i >= 0; i--) {
    const kept = snapshotStack.length - 1 - i;
    const entryBytes = patchBytesOf(snapshotStack[i]);
    if (kept >= MIN_HOT_RASTERS && bytes + entryBytes > budget) return i + 1;
    bytes += entryBytes;
  }
  return 0;
}

// Quality-1 WebP is lossless where supported; canvas falls back to lossless
// PNG when an engine cannot encode WebP.
const COLD_SNAPSHOT_WEBP_MIME = 'image/webp';
const COLD_SNAPSHOT_PNG_MIME = 'image/png';
const COLD_SNAPSHOT_LOSSLESS_WEBP_QUALITY = 1;

let paperCanvas: HTMLCanvasElement | null = null;
let paperCtx: CanvasRenderingContext2D | null = null;

// Paper contexts use round line caps and joins because the fold path strokes
// ops directly onto them.
function createPaperSurface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  return { canvas, ctx };
}

// True while every paper pixel is transparent-black AND nothing has forced the
// canvas's lazily-allocated backing store into existence — a freshly created
// or freshly swapped-in paper. While it holds, a folding 'clear' op can skip
// its full-canvas clearRect (the wipe is a no-op, but the first touch of an
// unallocated 2×-DPR paper materializes the whole ~30 MB surface — measured at
// ~500 ms inside the pointerup under the 4×-throttled software profile).
let paperPristine = false;

// Patch canvases are pooled rather than allocated per commit. Measured on an
// iPad Pro (iPad13,8, iPadOS 26.5) with a Web Inspector Timeline: every stroke
// commit produced a ~245 ms `composite` record — 15 commits, 15 composites,
// each starting 2-192 ms after its commit — while `paint` totalled 3 ms, `layout`
// 8 ms and every `engine.*` op stayed under 1.2 ms across the whole recording.
// The cost is not in the marked work; it lands in compositing after it returns,
// which is why the ADR-0066 gates never saw it. A fresh `<canvas>` gets a
// GPU-backed surface, and the commit path minted one per patch.
//
// Reuse is by "at least as large", not exact size: assigning width/height
// reallocates the backing store, which is the cost being avoided. A patch
// therefore lives in the TOP-LEFT of a possibly larger canvas, and `restorePatch`
// draws that sub-rect rather than the whole source. The encode/decode tier stays
// correct for the same reason — a blob of an oversized canvas still carries the
// patch at its top-left.
const patchCanvasPool: HTMLCanvasElement[] = [];
// One per undo entry plus headroom for multi-cluster commits (ADR-0074); past
// this, dropped canvases are left to the collector rather than held forever.
const PATCH_POOL_MAX = MAX_UNDO_DEPTH + 8;

function acquirePatchCanvas(w: number, h: number): HTMLCanvasElement {
  const index = patchCanvasPool.findIndex((canvas) => canvas.width >= w && canvas.height >= h);
  if (index !== -1) {
    const [canvas] = patchCanvasPool.splice(index, 1);
    // Only the region about to be written needs clearing; the rest is never read.
    canvas.getContext('2d')?.clearRect(0, 0, w, h);
    return canvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// Called only where a patch's canvas is provably unreachable: an entry evicted
// past the depth cap, or one popped and already restored.
function releasePatches(snap: Snapshot) {
  for (const patch of snap.patches) {
    if (patch.store.tier !== 'hot' || patch.store.encoding) continue;
    if (patchCanvasPool.length >= PATCH_POOL_MAX) return;
    patchCanvasPool.push(patch.store.canvas);
  }
}

// The pixels a patch is holding right now: a hot raster, or (demoted) the
// encoded blob they were re-encoded into. The in-flight flag belongs to the
// tier that can leave it — an encode only starts from a raster, a decode only
// from a blob — and each transition swaps the whole store in one assignment.
type PatchStore =
  | { tier: 'hot'; canvas: HTMLCanvasElement; encoding: boolean }
  | { tier: 'cold'; blob: Blob; decoding: boolean };

// One captured region of an entry's fold: its paper rect plus the pixels that
// were there before the fold.
interface SnapshotPatch {
  rect: PaperRect;
  store: PatchStore;
}

interface Snapshot {
  wasEmpty: boolean;
  // The disjoint regions this commit's fold mutated (foldRegionsForCommands):
  // one patch for most strokes, one per finger cluster for a spread
  // multi-touch gesture — so a five-finger drag captures five band-sized
  // copies instead of one near-full-paper union. Empty when the fold never
  // touched the paper (wholly magic-blocked, or clipped entirely off the
  // paper square): such an entry captures no pixels at all, and its undo only
  // reinstates the pending set.
  patches: SnapshotPatch[];
  // Commands committed but not yet folded when this snapshot was taken (magic
  // sheet unready) — replayed on top of the raster to reproduce the state.
  pending: StrokeGroupCommand[];
}

export interface RestoredSnapshot {
  wasEmpty: boolean;
  rects: PaperRect[];
}

interface RestoredPatch {
  source: CanvasImageSource;
  rect: PaperRect;
  bitmap: ImageBitmap | null;
}

const snapshotStack: Snapshot[] = [];
let pendingCommands: StrokeGroupCommand[] = [];

// Commands committed while an async deep-undo restore is mid-flight (see
// engine.ts's paper chain): their copy+fold must wait behind the pending
// restore, or the fold would land on the pre-restore paper and be clobbered
// by the decode's blit — the committed ink would vanish and the pushed
// snapshot would turn the next undo into a redo. Held apart from
// pendingCommands because they have no snapshot yet: popSnapshot reinstates a
// snapshot's captured pending set, and must not drop these.
const deferredCommands: StrokeGroupCommand[] = [];

export function deferCommand(cmd: StrokeGroupCommand) {
  deferredCommands.push(cmd);
}

// Complete a deferred commit's copy+fold, now that every restore queued ahead
// of it has landed: the snapshot it pushes copies the restored paper.
export function finalizeDeferredCommand() {
  const cmd = deferredCommands.shift();
  if (cmd) pushCommand(cmd);
}

function deferredCommandEmptyState(command: StrokeGroupCommand): boolean | null {
  if (command.ops.length === 0) return null;
  return command.ops.every((op) => op.kind === 'clear');
}

// A restore that lands beneath deferred commits becomes their baseline: the
// earliest one's captured pre-stroke state now reflects the restored paper
// (parallel to rebaseActiveCommand; later deferred commands sit on the
// earlier ones' ink, so their captured flags already hold). Returns whether
// the canvas is empty once the deferred commands replay on the restored
// paper, so the caller's empty flag tracks what repaintAll shows.
export function rebaseDeferredCommands(restoredEmpty: boolean): boolean {
  if (deferredCommands.length === 0) return restoredEmpty;
  deferredCommands[0].wasEmpty = restoredEmpty;
  for (let i = deferredCommands.length - 1; i >= 0; i--) {
    const emptyState = deferredCommandEmptyState(deferredCommands[i]);
    if (emptyState !== null) return emptyState;
  }
  return restoredEmpty;
}

// The stroke group currently being drawn (opened on first paint, pushed to the
// stack when the last finger lifts), so a multi-touch gesture undoes as a
// single unit.
let activeCommand: StrokeGroupCommand | null = null;

// A max(w,h) square of the paper covers both orientations, so rotation never
// loses pixels; anything larger (e.g. a resized desktop window) goes through
// the grow path, copying existing pixels so no drawing is lost. Recorded ops
// use the paper's coordinates, and content off the current viewport survives
// here even though the visible canvas clips it.
export function ensurePaperCovers(squareSide: number) {
  if (!paperCanvas) {
    const paper = createPaperSurface(squareSide, squareSide);
    paperCanvas = paper.canvas;
    paperCtx = paper.ctx;
    paperPristine = true;
    return;
  }
  if (squareSide <= paperCanvas.width && squareSide <= paperCanvas.height) return;
  const grown = createPaperSurface(
    Math.max(squareSide, paperCanvas.width),
    Math.max(squareSide, paperCanvas.height)
  );
  if (!grown.ctx) {
    console.error('ensurePaperCovers: grown canvas context unavailable, keeping existing paper');
    return;
  }
  grown.ctx.drawImage(paperCanvas, 0, 0);
  paperCanvas = grown.canvas;
  paperCtx = grown.ctx;
  paperPristine = false;
}

// Open the undo command for a new stroke group. `wasEmpty` is the canvas-empty
// state before the group drew, captured so undo can restore the flag.
export function beginCommand(wasEmpty: boolean) {
  activeCommand = { ops: [], wasEmpty };
}

// Append an op to the active stroke-group command so the in-flight stroke can
// be repainted (resize mid-stroke) and folded into the paper at commit. No-op
// between groups (activeCommand is null).
export function recordOp(op: StrokeOp) {
  if (activeCommand) activeCommand.ops.push(op);
}

// The paper-space rects of the active command's closed crayon passes. The
// engine reads them just before commit: once the fold stamps those rasters
// into the paper, the same rects are blitted BACK onto the visible canvas
// (blitPaperRect) so the on-screen pixels are the committed pixels from commit
// onward. The stamp composite rounds ±1 differently for the overlay's
// device-rect blit than for the cropped raster (canvas-backing-dependent
// premultiplied rounding), so without the reconcile a rebuild would differ
// from the live stamp at the byte level — imperceptibly, but undo and remount
// must reproduce the screen exactly.
export function activeCrayonRasterRects(): PaperRect[] {
  if (!activeCommand) return [];
  const rects: PaperRect[] = [];
  for (const op of activeCommand.ops) {
    if (op.kind === 'crayonPassRaster') {
      rects.push({ x: op.x, y: op.y, w: op.canvas.width, h: op.canvas.height });
    }
  }
  return rects;
}

// Copy a committed paper rect onto a target, replacing what the target showed
// there. Coordinates are paper-space; the target's own transform places the
// rect (identity on the visible canvas normally, the paper view when locked).
export function blitPaperRect(target: CanvasRenderingContext2D, rect: PaperRect) {
  const { x, y, w, h } = rect;
  if (!paperCanvas) return;
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(paperCanvas.width, x + w);
  const y1 = Math.min(paperCanvas.height, y + h);
  if (x1 <= x0 || y1 <= y0) return;
  target.save();
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  target.clearRect(x0, y0, x1 - x0, y1 - y0);
  target.drawImage(paperCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  target.restore();
}

// Swap the just-closed crayon pass's recorded ops for its prerendered raster
// op (see crayonPassBuffer's closeLiveCrayonPass). The pass is exactly the maximal
// trailing run of crayon ink ops: the engine closes an open pass before any
// non-crayon ink op records (closeCrayonPassBeforeForeignOp — a mid-gesture
// brush switch can interleave brushes within one group), so every op since
// the previous pass close is crayon, and a closed pass always ends at a
// raster/flush/clear boundary that stops the scan. Keeping ONE op stream —
// rasters for closed passes, raw ops only for the open pass — is what lets
// the fold, repaints, snapshot pending replay, and export all stay a single
// renderOp walk. No-op between groups, matching recordOp.
export function replaceOpenCrayonPassOps(raster: StrokeOp) {
  if (!activeCommand) return;
  const ops = activeCommand.ops;
  const popped: StrokeOp[] = [];
  while (ops.length > 0) {
    const last = ops[ops.length - 1];
    if ((last.kind === 'dot' || last.kind === 'path') && last.crayon && !last.erase) {
      popped.push(ops.pop()!);
    } else break;
  }
  // Boundary guard: if the scan stopped on an ink/erase op rather than a pass
  // boundary (raster/flush/clear or the command start), a foreign op sits
  // INSIDE the pass's op run and the raster can't be attributed — its pixels
  // would resurrect ink the foreign op erased or painted over. Restore the
  // raw ops and record a plain flush instead: the legacy re-render fold stays
  // correct (it replays the interleave in op order, implicit flushes and all).
  const tail = ops[ops.length - 1];
  if (tail && (tail.kind === 'dot' || tail.kind === 'path')) {
    while (popped.length > 0) ops.push(popped.pop()!);
    ops.push({ kind: 'crayonFlush' });
    return;
  }
  ops.push(raster);
}

// Finalize the stroke group built up since beginCommand() and push it onto the
// snapshot stack. Called once per group, when the last finger lifts. Returns
// false when no group was open (nothing painted). `defer` parks the command
// for a later finalizeDeferredCommand instead of pushing now — the
// commit-during-pending-restore path (see deferredCommands).
export function commitActiveCommand(defer = false): boolean {
  if (!activeCommand) return false;
  if (defer) deferCommand(activeCommand);
  else pushCommand(activeCommand);
  activeCommand = null;
  return true;
}

// Capture-by-swap for a clear: adopt the current paper canvas as the snapshot
// raster (its pixels ARE the full-paper patch a clear's fold region demands)
// and install a fresh, already-blank paper for the fold to land on, licensed by
// the fold plan being `wipesPaper` with exactly one rect. O(1)
// pointer swap + allocation instead of drawImage-copying the whole 2×-DPR
// paper — the worst fixed pointerup hitch in the 2026-07 profile. Null when
// the fresh canvas yields no context; the caller falls back to the copy path.
function adoptPaperAsSnapshot(): HTMLCanvasElement | null {
  if (!paperCanvas) return null;
  const fresh = createPaperSurface(paperCanvas.width, paperCanvas.height);
  if (!fresh.ctx) return null;
  const adopted = paperCanvas;
  paperCanvas = fresh.canvas;
  paperCtx = fresh.ctx;
  paperPristine = true;
  // Materialize the fresh paper's backing store off the interaction path, so
  // the first post-clear stroke's fold doesn't pay the surface allocation
  // inside its own pointerup. A 1×1 clearRect is enough to force allocation
  // and is a no-op on the blank paper; skipped if ink landed first (undoing
  // the clear restores pixels a stray clearRect would then erase).
  scheduleIdle(() => {
    if (paperPristine && paperCtx) paperCtx.clearRect(0, 0, 1, 1);
  });
  return adopted;
}

// The prefix of `commands` the fold may render now: it stops at the first
// command the unready magic sheet would render blank (nothing after it folds
// either, preserving cross-command ordering — eraser, crayon mix).
function foldableCount(commands: StrokeGroupCommand[]): number {
  if (!isMagicSheetUnready()) return commands.length;
  let n = 0;
  for (const cmd of commands) {
    if (commandHasMagic(cmd)) break;
    n++;
  }
  return n;
}

// Capture the pixels of `paper` under each planned fold region. Swapping and
// copying are mutually exclusive: an adopted paper returns as the entry's one
// patch, and adoptPaperAsSnapshot only installs the fresh canvas on the path
// that succeeds, so the copy loop below always runs against a paper no swap
// has touched. Taking that paper as a parameter pins the capture to the
// caller's canvas — the one whose dimensions foldRegionsForCommands planned
// these rects against — instead of re-reading mutable module state.
//
// Null when a patch canvas yields no 2D context: that loses this one undo
// entry, never the ink — the caller's fold must still run or the stroke would
// vanish from the committed paper. The degraded corner that comes with it:
// with no entry above that fold, its ink outside LOWER entries' rects survives
// every deeper undo (a full-paper snapshot used to wipe it). Accepted —
// keeping a child's stroke while losing its undo step beats deleting ink — but
// it means the restore induction (see restorePatch) is conditional on every
// fold having pushed its entry (all patches or none — a partial capture
// couldn't cover the fold). No rects isn't a failure: the fold won't touch the
// paper, so the entry legitimately carries no pixels.
function capturePatchesUnder(
  paper: HTMLCanvasElement,
  rects: PaperRect[],
  wipesPaper: boolean
): SnapshotPatch[] | null {
  // A clear in the fold set claims the full paper AND never reads the
  // pre-fold pixels, so the paper itself becomes the patch (swap, not copy).
  // Only a plan that is exactly that one full-paper rect can be captured by
  // swapping — a multi-rect plan still needs its per-rect copies.
  const adopted = wipesPaper && rects.length === 1 ? adoptPaperAsSnapshot() : null;
  if (adopted) {
    return [{ rect: rects[0], store: { tier: 'hot', canvas: adopted, encoding: false } }];
  }
  const patches: SnapshotPatch[] = [];
  for (const rect of rects) {
    const copy = acquirePatchCanvas(rect.w, rect.h);
    const copyCtx = copy.getContext('2d');
    if (!copyCtx) return null;
    copyCtx.drawImage(paper, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    patches.push({ rect, store: { tier: 'hot', canvas: copy, encoding: false } });
  }
  return patches;
}

// Commit: capture the pre-stroke paper patch under the region the fold is
// about to mutate, push it, then fold the new command in. The fold set (and
// so the rect) is decided once, up front — capture and fold must agree on
// exactly which commands render, or the patch wouldn't cover the mutation.
// Inside the surrounding engine.commit measure, engine.snapshot isolates the
// patch-capture cost and engine.fold isolates rendering the committed ops
// onto the paper — the two pointerup hitch candidates, kept apart so a hot
// commit can be attributed to the right one.
export function pushCommand(cmd: StrokeGroupCommand) {
  if (!paperCanvas || !paperCtx) {
    console.error('pushCommand: no paper context; dropping committed stroke');
    return;
  }
  if (PERF_MARKS) performance.mark('engine.snapshot:start');
  const prospective = [...pendingCommands, cmd];
  const foldCount = foldableCount(prospective);
  const folding = prospective.slice(0, foldCount);
  const { rects, wipesPaper } = foldRegionsForCommands(
    folding,
    paperCanvas.width,
    paperCanvas.height
  );
  const patches = capturePatchesUnder(paperCanvas, rects, wipesPaper);
  if (patches) {
    snapshotStack.push({
      wasEmpty: cmd.wasEmpty,
      patches,
      pending: [...pendingCommands],
    });
    while (snapshotStack.length > MAX_UNDO_DEPTH) {
      const evicted = snapshotStack.shift();
      if (evicted) releasePatches(evicted);
    }
  }
  if (PERF_MARKS) performance.measure('engine.snapshot', 'engine.snapshot:start');
  pendingCommands.push(cmd);
  if (PERF_MARKS) performance.mark('engine.fold:start');
  foldPendingIntoPaper(foldCount);
  if (PERF_MARKS) performance.measure('engine.fold', 'engine.fold:start');
  scheduleColdEncode();
  if (PERF_MARKS) performance.mark('engine.reinflate:start');
  reinflateHotSnapshots();
  if (PERF_MARKS) {
    performance.mark('engine.reinflate:end');
    performance.measure('engine.reinflate', 'engine.reinflate:start', 'engine.reinflate:end');
  }
}

// Fold the first `count` pending commands into the paper, oldest first. The
// count comes from foldableCount() over the same list the pre-fold patch
// capture measured, so the captured rect covers exactly what renders here.
function foldPendingIntoPaper(count: number) {
  if (!paperCtx) return;
  for (let i = 0; i < count; i++) {
    const cmd = pendingCommands.shift();
    if (!cmd) return;
    for (const op of cmd.ops) {
      // A clear folding onto a pristine paper keeps its crayon side effects
      // but skips the pixel wipe — see paperPristine.
      if (op.kind === 'clear' && paperPristine) {
        resetCrayonStateForClear(paperCtx);
        continue;
      }
      paperPristine = false;
      renderOp(paperCtx, op);
    }
  }
}

function isInHotWindow(snap: Snapshot): boolean {
  const i = snapshotStack.indexOf(snap);
  return i >= 0 && i >= hotWindowStart();
}

// Demotion may only trust a blob that is plausibly the lossless encoding it
// asked for: WebP (Chromium and Firefox 105+ encode quality-1 WebP
// losslessly) or the spec-mandated toBlob fallback PNG (lossless everywhere;
// Safari has no canvas WebP encoder and always takes it). Anything else —
// null, empty, or an unexpected type from a nonconforming engine — fails
// here, and the entry keeps its hot raster instead: more memory, but undo
// stays byte-exact. Exported as the unit-test seam for the validation rule.
export function isValidColdSnapshotBlob(blob: Blob | null): blob is Blob {
  return (
    blob !== null &&
    blob.size > 0 &&
    (blob.type === COLD_SNAPSHOT_WEBP_MIME || blob.type === COLD_SNAPSHOT_PNG_MIME)
  );
}

// Demote snapshots below the hot window to encoded blobs, freeing their
// patch rasters (stroke-sized; worst case the full ~30 MB paper for a clear or
// a canvas-spanning scribble). WebP first (Chromium encodes quality-1 WebP losslessly at a
// fraction of PNG's size); engines that can't encode WebP hand back a PNG blob
// (per spec toBlob falls back to image/png), which is lossless everywhere.
// The returned blob is validated before the raster is dropped — see
// isValidColdSnapshotBlob. An entry that rose into the hot window while its
// encode was in flight keeps the raster it never lost.
// Coalesces the encodes the budget does not absorb onto an idle callback, so
// the commit that pushed an entry past the budget still presents its frame.
// The pass re-reads the stack when it runs and every transition re-checks the
// window, so running late is safe; a second commit before it fires reuses the
// pending one rather than queueing another.
let coldEncodeScheduled = false;

function scheduleColdEncode() {
  if (coldEncodeScheduled) return;
  coldEncodeScheduled = true;
  scheduleIdle(() => {
    coldEncodeScheduled = false;
    if (PERF_MARKS) performance.mark('engine.encode:start');
    encodeColdSnapshots();
    if (PERF_MARKS) {
      performance.mark('engine.encode:end');
      performance.measure('engine.encode', 'engine.encode:start', 'engine.encode:end');
    }
  });
}

function encodeColdSnapshots() {
  const coldEnd = hotWindowStart();
  for (let i = 0; i < coldEnd; i++) {
    const snap = snapshotStack[i];
    for (const patch of snap.patches) {
      const store = patch.store;
      if (store.tier !== 'hot' || store.encoding) continue;
      const source = store.canvas;
      store.encoding = true;
      source.toBlob(
        (blob) => {
          const current = patch.store;
          if (current.tier === 'hot') current.encoding = false;
          if (!isValidColdSnapshotBlob(blob)) return; // bad encode — keep the raster
          if (current.tier !== 'hot' || current.canvas !== source || isInHotWindow(snap)) return;
          patch.store = { tier: 'cold', blob, decoding: false };
        },
        COLD_SNAPSHOT_WEBP_MIME,
        COLD_SNAPSHOT_LOSSLESS_WEBP_QUALITY
      );
    }
  }
}

// Re-inflate encoded entries that rise into the hot window — undo popping the
// stack, or a commit landing on an undo-shallowed one — so the
// "entries inside the resident byte budget are hot rasters" invariant survives
// undo-then-draw instead of only holding while the stack grows. Fire-and-forget
// off the interaction path, like the encode tier; it never touches the paper,
// so it cannot race the undo/paper chain — a re-inflating entry popped for undo
// mid-decode fails the isInHotWindow re-check and popSnapshot's own decode
// stays the single restore path.
function reinflateHotSnapshots() {
  for (let i = hotWindowStart(); i < snapshotStack.length; i++) {
    const snap = snapshotStack[i];
    for (const patch of snap.patches) {
      const store = patch.store;
      if (store.tier !== 'cold' || store.decoding) continue;
      const source = store.blob;
      store.decoding = true;
      createImageBitmap(source).then(
        (bitmap) => {
          const current = patch.store;
          if (current.tier === 'cold') current.decoding = false;
          if (current.tier !== 'cold' || current.blob !== source || !isInHotWindow(snap)) {
            bitmap.close();
            return;
          }
          const live = document.createElement('canvas');
          live.width = bitmap.width;
          live.height = bitmap.height;
          const liveCtx = live.getContext('2d');
          if (!liveCtx) {
            bitmap.close();
            return;
          }
          liveCtx.drawImage(bitmap, 0, 0);
          bitmap.close();
          patch.store = { tier: 'hot', canvas: live, encoding: false };
        },
        () => {
          // decode failed — keep the blob; deep undo retries it
          const current = patch.store;
          if (current.tier === 'cold') current.decoding = false;
        }
      );
    }
  }
}

// Pop the top snapshot and restore it as the committed paper state. Live
// patch rasters restore synchronously; demoted patches decode from their
// blobs first, so the caller repaints when the promise resolves. The resolved
// rects are the regions the restore mutated (empty when the fold never
// touched the paper), so an eligible caller can repaint just those patches
// instead of the whole canvas — see engine.undo. Null when nothing is
// undoable.
export function popSnapshot(): Promise<RestoredSnapshot> | null {
  const snap = snapshotStack.pop();
  if (!snap) return null;
  pendingCommands = [...snap.pending];
  reinflateHotSnapshots();
  const rects = snap.patches.map((p) => p.rect);
  // No patches means this commit's fold never touched the paper, so undoing
  // it is just the pending-set reinstatement above.
  if (snap.patches.length === 0) return Promise.resolve({ wasEmpty: snap.wasEmpty, rects });
  const hotCanvases = snap.patches.map((p) => (p.store.tier === 'hot' ? p.store.canvas : null));
  if (hotCanvases.every((canvas) => canvas !== null)) {
    hotCanvases.forEach((canvas, i) => restorePatch(canvas, snap.patches[i].rect));
    // The entry is off the stack and its pixels are on the paper, so its canvases
    // are unreachable. The async (decode) path below deliberately does not
    // release: its restore finishes later, and an early release would hand out a
    // canvas still being read.
    releasePatches(snap);
    return Promise.resolve({ wasEmpty: snap.wasEmpty, rects });
  }
  // Decode every demoted patch, then restore the whole entry in one pass (the
  // rects are disjoint, so within-entry order is immaterial).
  return Promise.all(
    snap.patches.map(async (p): Promise<RestoredPatch> => {
      if (p.store.tier === 'hot') {
        return { source: p.store.canvas, rect: p.rect, bitmap: null };
      }
      const bitmap = await createImageBitmap(p.store.blob);
      return { source: bitmap, rect: p.rect, bitmap };
    })
  ).then((restores) => {
    for (const r of restores) {
      restorePatch(r.source, r.rect);
      r.bitmap?.close();
    }
    return { wasEmpty: snap.wasEmpty, rects };
  });
}

// Blit a captured patch back over the region its commit's fold mutated.
// Pixels outside the rect were untouched by that fold — or were already
// reverted by later pops, the stack being LIFO — so clearing and redrawing
// just the rect reproduces the exact pre-stroke paper.
function restorePatch(source: CanvasImageSource, rect: PaperRect) {
  if (!paperCtx) return;
  paperPristine = false;
  paperCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
  // Sub-rect, not the whole source: a pooled canvas can be larger than the patch
  // it holds, and the patch always sits at its top-left.
  paperCtx.drawImage(source, 0, 0, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
}

export function snapshotCount(): number {
  return snapshotStack.length;
}

// Whether any commands sit outside the folded paper: pending behind an unready
// magic sheet, deferred behind an in-flight restore, or the open stroke. While
// any exist, an undo repaint must rebuild the whole canvas — their pixels live
// only in the op replay, so a patch-rect blit can't reproduce (or remove)
// them. Checked by engine.undo on both sides of the restore before it takes
// the rect-limited repaint path.
export function hasUnfoldedCommands(): boolean {
  return pendingCommands.length > 0 || deferredCommands.length > 0 || activeCommand !== null;
}

// Just the count of commands the unready magic sheet is holding out of the
// paper — the one field commitStrokeGroup reads, without getHistoryDebug's
// whole-stack reduces (which it would discard) in the pointerup hitch window.
export function pendingCommandCount(): number {
  return pendingCommands.length;
}

// A clear can arrive while a stroke straddles it (e.g. a second finger drawing
// while drag-to-clear completes). That stroke's command commits *after* the
// clear command on lift, so its pre-clear ops must be dropped or the fold
// would paint them on top of the clear, resurrecting wiped ink. The command
// stays open (committing here would fire stroke-end callbacks mid-stroke);
// it just restarts empty. Returns whether a stroke was live, so the caller
// knows the canvas isn't empty yet.
export function resetActiveCommandForClear(): boolean {
  if (!activeCommand) return false;
  activeCommand.ops.length = 0;
  activeCommand.wasEmpty = true;
  return true;
}

// Undo can change the committed drawing beneath an open stroke. Rebase its
// captured pre-stroke state so undoing that stroke after commit restores the
// new underlying state. Returns whether a live stroke still counts as content.
export function rebaseActiveCommand(wasEmpty: boolean): boolean {
  if (!activeCommand) return false;
  activeCommand.wasEmpty = wasEmpty;
  return true;
}

function commandHasMagic(command: StrokeGroupCommand): boolean {
  return command.ops.some((op) => (op.kind === 'dot' || op.kind === 'path') && op.magic);
}

// Reconstruct the full drawing onto a target: the paper IS the committed
// drawing — one blit — plus any commands the unready magic sheet is holding
// out of the paper, plus any commits deferred behind a pending restore, plus
// the in-flight stroke. A mid-stroke resize still has an uncommitted
// activeCommand (its ops are recorded but not yet folded), so replay it last
// to keep the in-flight stroke; between strokes activeCommand is null and
// that step is a no-op.
function replayCommands(target: CanvasRenderingContext2D, commands: StrokeGroupCommand[]): void {
  for (const cmd of commands) for (const op of cmd.ops) renderOp(target, op);
}

export function repaintAll(target: CanvasRenderingContext2D) {
  // Replaying the open pass's ops below rebuilds its crayon accumulation from
  // scratch; the live buffers must start empty so a non-idempotent deposit
  // can never double-composite on a repaint (see crayonPassBuffer).
  resetLiveCrayonForReplay(target);
  clearAllOf(target);
  if (paperCanvas) target.drawImage(paperCanvas, 0, 0);
  replayCommands(target, pendingCommands);
  replayCommands(target, deferredCommands);
  replayCommands(target, activeCommand ? [activeCommand] : []);
}

// Test/profiling seam: how the undo history is currently stored. `liveRasters`
// counts ENTRIES still holding any patch canvas (≤ the budget's entries plus
// those whose encode hasn't landed). It is entry-level on purpose: the settle
// gates in engine-snapshot-tier.spec.ts and scripts/perf/undo-scenarios.mjs
// compare it against the budget, and a multi-patch entry would overshoot a
// patch-level count.
// `rasterBytes` is the hot patches' actual pixel cost (w × h × 4 —
// patch-sized since ADR-0069, per-cluster since ADR-0074); `blobBytes` is the
// encoded tier's total size — together the history memory the perf harness
// reports; `pendingCommands` counts commands the unready magic sheet is
// holding out of the paper.
export interface HistoryDebug {
  snapshots: number;
  liveRasters: number;
  rasterBytes: number;
  blobBytes: number;
  // Every patch's pixel cost from its rect, cold entries included — what the
  // stack would occupy resident if nothing were ever encoded. `rasterBytes`
  // counts only what is resident *now*, so it cannot answer whether the
  // encoding that costs a WebKit commit its whole budget is buying headroom the
  // ≲150 MB gate still needs.
  patchBytes: number;
  pendingCommands: number;
}

export function getHistoryDebug(): HistoryDebug {
  let liveRasters = 0;
  let rasterBytes = 0;
  let blobBytes = 0;
  let patchBytes = 0;

  for (const snapshot of snapshotStack) {
    let hasHotPatch = false;
    for (const patch of snapshot.patches) {
      patchBytes += patch.rect.w * patch.rect.h * 4;
      if (patch.store.tier === 'hot') {
        hasHotPatch = true;
        rasterBytes += patch.store.canvas.width * patch.store.canvas.height * 4;
      } else {
        blobBytes += patch.store.blob.size;
      }
    }
    if (hasHotPatch) liveRasters++;
  }

  return {
    snapshots: snapshotStack.length,
    liveRasters,
    rasterBytes,
    blobBytes,
    patchBytes,
    pendingCommands: pendingCommands.length,
  };
}
