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
// Memory is tiered on top of that: the K_LIVE most recent snapshots stay live
// rasters (patch-sized — a stroke's bounding rect, worst case the full ~30 MB
// paper at 2× DPR on a 13″ iPad for a canvas-spanning scribble or a clear);
// older entries are encoded to a lossless blob off the commit path and decoded
// again only on deep undo. The tier re-balances in both directions: undo (or a
// commit on an undo-shallowed stack) can raise an encoded entry into the
// K_LIVE window, and it re-inflates back to a live raster off the hot path
// (reinflateHotSnapshots), so the window holds after undo-then-draw, not only
// while the stack grows.
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

import {
  clearAllOf,
  renderOp,
  resetCrayonStateForClear,
  resetLiveCrayonForReplay,
  type StrokeGroupCommand,
  type StrokeOp,
} from './strokeOps';
import { isMagicSheetUnready } from './magicBrush';
import { getCrayonPasses } from './crayonBrush';
import { scheduleIdle } from '../idle';
import { PERF_MARKS } from './perf';

// The snapshot stack depth — how many strokes a child can take back. Depth 20
// keeps a child from hitting the wall mid-correction (raised from 10 after
// user feedback). Beyond K_LIVE live rasters the per-entry cost is an encoded
// blob (single-digit MB even for crayon-heavy paper), so depth is bounded by
// blob bytes, not raster count. Exported as the depth-cap test seam.
export const MAX_UNDO_STACK_SIZE = 20;

// How many of the most recent snapshots stay live rasters for instant undo;
// everything deeper demotes to an encoded blob (encodeColdSnapshots), and a
// blob rising back into the window re-inflates (reinflateHotSnapshots).
const K_LIVE = 2;

let paperCanvas: HTMLCanvasElement | null = null;
let paperCtx: CanvasRenderingContext2D | null = null;

// True while every paper pixel is transparent-black AND nothing has forced the
// canvas's lazily-allocated backing store into existence — a freshly created
// or freshly swapped-in paper. While it holds, a folding 'clear' op can skip
// its full-canvas clearRect (the wipe is a no-op, but the first touch of an
// unallocated 2×-DPR paper materializes the whole ~30 MB surface — measured at
// ~500 ms inside the pointerup under the 4×-throttled software profile).
let paperPristine = false;

// The paper region a snapshot's patch covers, in whole paper pixels (so the
// capture and restore blits are exact 1:1 copies, never resampled).
export interface PatchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// One captured region of an entry's fold: its paper rect plus the pixels that
// were there before the fold, as a live raster or (demoted) an encoded blob.
interface SnapshotPatch {
  rect: PatchRect;
  canvas: HTMLCanvasElement | null;
  blob: Blob | null;
  encoding: boolean;
  decoding: boolean;
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
    const ops = deferredCommands[i].ops;
    if (ops.some((op) => op.kind !== 'clear')) return false;
    if (ops.length > 0) return true;
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
// here even though the visible canvas clips it. Fresh/grown contexts get the
// round line cap/join because the fold path strokes ops directly onto them.
export function ensurePaperCovers(squareSide: number) {
  if (!paperCanvas) {
    paperCanvas = document.createElement('canvas');
    paperCanvas.width = squareSide;
    paperCanvas.height = squareSide;
    paperCtx = paperCanvas.getContext('2d');
    if (paperCtx) {
      paperCtx.lineCap = 'round';
      paperCtx.lineJoin = 'round';
    }
    paperPristine = true;
    return;
  }
  if (squareSide <= paperCanvas.width && squareSide <= paperCanvas.height) return;
  const grown = document.createElement('canvas');
  grown.width = Math.max(squareSide, paperCanvas.width);
  grown.height = Math.max(squareSide, paperCanvas.height);
  const grownCtx = grown.getContext('2d');
  if (grownCtx) {
    grownCtx.lineCap = 'round';
    grownCtx.lineJoin = 'round';
    grownCtx.drawImage(paperCanvas, 0, 0);
  }
  paperCanvas = grown;
  paperCtx = grownCtx;
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
export function activeCrayonRasterRects(): { x: number; y: number; w: number; h: number }[] {
  if (!activeCommand) return [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
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
export function blitPaperRect(
  target: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
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
// op (see strokeOps' closeLiveCrayonPass). The pass is exactly the maximal
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

// AA bleed pad in paper px around an op's geometric bounds, matching
// strokeOps' unionCrayonBounds — it covers anti-aliased edges, and keeps the
// crayon flush stamp inside the rect (the pass buffer bounds its stamp with
// this same pad).
const PATCH_AA_PAD = 2;

// Padded float bounding boxes, merged toward disjointness before they round
// to patch rects.
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// An op's padded geometric bounds in paper space (pre-clamp floats). A path's
// quadratic control points bound the curve's hull, so start + segs' points
// padded by the stroke half-width cover the ink; a 'crayonPassRaster' stamps
// exactly its canvas at its paper position, so its bounds are the raster's
// rect; a 'crayonFlush' has no geometry of its own (its stamp is bounded by
// the pass's crayon ops, already unioned) — null. 'clear' is the callers'
// short-circuit, never passed here.
function opPaddedBounds(op: StrokeOp, crayonScale: number): Box | null {
  if (op.kind === 'clear' || op.kind === 'crayonFlush') return null;
  if (op.kind === 'crayonPassRaster') {
    return {
      x0: op.x - PATCH_AA_PAD,
      y0: op.y - PATCH_AA_PAD,
      x1: op.x + op.canvas.width + PATCH_AA_PAD,
      y1: op.y + op.canvas.height + PATCH_AA_PAD,
    };
  }
  // Magic and erase render at base width (renderOp routes them before the
  // crayon branch); only a crayon ink op picks up the pass scale.
  const scale = op.crayon && !op.erase && !op.magic ? crayonScale : 1;
  if (op.kind === 'dot') {
    const pad = op.radius * scale + PATCH_AA_PAD;
    return { x0: op.x - pad, y0: op.y - pad, x1: op.x + pad, y1: op.y + pad };
  }
  let x0 = op.startX;
  let y0 = op.startY;
  let x1 = op.startX;
  let y1 = op.startY;
  for (const s of op.segs) {
    x0 = Math.min(x0, s.cx, s.x);
    y0 = Math.min(y0, s.cy, s.y);
    x1 = Math.max(x1, s.cx, s.x);
    y1 = Math.max(y1, s.cy, s.y);
  }
  const pad = (op.lineWidth / 2) * scale + PATCH_AA_PAD;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function mergeInto(target: Box, b: Box) {
  target.x0 = Math.min(target.x0, b.x0);
  target.y0 = Math.min(target.y0, b.y0);
  target.x1 = Math.max(target.x1, b.x1);
  target.y1 = Math.max(target.y1, b.y1);
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// More clusters than this and the capture degenerates to one union rect: the
// per-patch bookkeeping (copies, encodes, restore blits) stops paying for
// itself, and no real gesture produces more (five fingers → five clusters).
const PATCH_CLUSTER_CAP = 8;

// More RAW clusters than this and the capture skips the merge fixpoint
// entirely and takes the union up front: the scan is O(n³) worst case on the
// commit hot path, and only a magic-unready backlog folding under one commit
// can push the count this high — a fold that large unions to ~the whole paper
// after merging anyway, so nothing real is lost by not trying.
const MERGE_INPUT_CAP = PATCH_CLUSTER_CAP * 8;

function unionBoxes(boxes: Box[]): Box {
  const union = boxes[0];
  for (let i = 1; i < boxes.length; i++) mergeInto(union, boxes[i]);
  return union;
}

// The disjoint paper regions folding `commands` will mutate, clamped to the
// paper. Ops cluster per stroke (a path op's command index + pointer id;
// dots and pass rasters seed their own cluster) and intersecting clusters
// merge to a fixpoint, so a spread multi-finger gesture yields one band-sized
// rect per finger instead of a near-full-paper union — the union bbox is the
// worst case, never exceeded (ADR-0069's containment invariant holds per
// cluster: every op's padded bounds sit inside its cluster's rect). A 'clear'
// wipes everything, so it short-circuits to the full paper. Empty when
// nothing would touch the paper — no foldable commands, or ink wholly outside
// the paper square (margin ink is clipped at fold, ADR-0050). Exported as the
// rect-math unit-test seam.
export function foldRegionsForCommands(
  commands: StrokeGroupCommand[],
  paperW: number,
  paperH: number
): PatchRect[] {
  // Crayon density passes stroke at op.lineWidth × widthScale (dot radius ×
  // widthScale). The shipped passes never exceed 1, but the dev harness's
  // setCrayonParams accepts arbitrary passes — a widthScale > 1 experiment
  // would fold ink outside the base-width pad and undo would leave its fringe
  // behind. Scale crayon ink pads by the widest pass so the containment
  // invariant (ADR-0069) holds mid-experiment too.
  let crayonScale = 1;
  for (const p of getCrayonPasses()) crayonScale = Math.max(crayonScale, p.widthScale);
  const clusters = new Map<string, Box>();
  let solo = 0;
  for (let c = 0; c < commands.length; c++) {
    for (const op of commands[c].ops) {
      if (op.kind === 'clear') return [{ x: 0, y: 0, w: paperW, h: paperH }];
      const box = opPaddedBounds(op, crayonScale);
      if (!box) continue;
      const key = op.kind === 'path' ? `${c}:${op.pid}` : `solo:${solo++}`;
      const cluster = clusters.get(key);
      if (cluster) mergeInto(cluster, box);
      else clusters.set(key, box);
    }
  }
  let boxes = [...clusters.values()];
  if (boxes.length > MERGE_INPUT_CAP) {
    boxes = [unionBoxes(boxes)];
  } else {
    // Merge intersecting clusters to a fixpoint, so the returned rects are
    // disjoint (a finger's start dot merges into its stroke; crossing fingers
    // merge with each other).
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxesIntersect(boxes[i], boxes[j])) {
            mergeInto(boxes[i], boxes[j]);
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }
    if (boxes.length > PATCH_CLUSTER_CAP) boxes = [unionBoxes(boxes)];
  }
  const rects: PatchRect[] = [];
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x0));
    const y = Math.max(0, Math.floor(b.y0));
    const w = Math.min(paperW, Math.ceil(b.x1)) - x;
    const h = Math.min(paperH, Math.ceil(b.y1)) - y;
    if (w > 0 && h > 0) rects.push({ x, y, w, h });
  }
  return rects;
}

// Whether the fold set wipes the paper: a 'clear' op discards every pixel
// before it, and everything after renders onto blank — so the fold's result
// never reads the pre-fold paper, licensing the swap capture in pushCommand.
function foldContainsClear(commands: StrokeGroupCommand[]): boolean {
  return commands.some((cmd) => cmd.ops.some((op) => op.kind === 'clear'));
}

// Capture-by-swap for a clear: adopt the current paper canvas as the snapshot
// raster (its pixels ARE the full-paper patch a clear's fold region demands)
// and install a fresh, already-blank paper for the fold to land on. O(1)
// pointer swap + allocation instead of drawImage-copying the whole 2×-DPR
// paper — the worst fixed pointerup hitch in the 2026-07 profile. Null when
// the fresh canvas yields no context; the caller falls back to the copy path.
function adoptPaperAsSnapshot(): HTMLCanvasElement | null {
  if (!paperCanvas) return null;
  const fresh = document.createElement('canvas');
  fresh.width = paperCanvas.width;
  fresh.height = paperCanvas.height;
  const freshCtx = fresh.getContext('2d');
  if (!freshCtx) return null;
  freshCtx.lineCap = 'round';
  freshCtx.lineJoin = 'round';
  const adopted = paperCanvas;
  paperCanvas = fresh;
  paperCtx = freshCtx;
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
  let n = 0;
  for (const cmd of commands) {
    if (commandHasMagic(cmd) && isMagicSheetUnready()) break;
    n++;
  }
  return n;
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
  if (!paperCanvas || !paperCtx) return;
  if (PERF_MARKS) performance.mark('engine.snapshot:start');
  const prospective = [...pendingCommands, cmd];
  const foldCount = foldableCount(prospective);
  const folding = prospective.slice(0, foldCount);
  const rects = foldRegionsForCommands(folding, paperCanvas.width, paperCanvas.height);
  const patches: SnapshotPatch[] = [];
  let captureFailed = false;
  // A clear in the fold set claims the full paper AND never reads the
  // pre-fold pixels, so the paper itself becomes the patch (swap, not copy).
  const adopted = foldContainsClear(folding) ? adoptPaperAsSnapshot() : null;
  if (adopted && rects.length === 1) {
    patches.push({ rect: rects[0], canvas: adopted, blob: null, encoding: false, decoding: false });
  } else {
    for (const rect of rects) {
      const copy = document.createElement('canvas');
      copy.width = rect.w;
      copy.height = rect.h;
      const copyCtx = copy.getContext('2d');
      if (!copyCtx) {
        captureFailed = true;
        break;
      }
      copyCtx.drawImage(paperCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      patches.push({ rect, canvas: copy, blob: null, encoding: false, decoding: false });
    }
  }
  // A failed patch context loses this one undo entry, never the ink — the fold
  // below must still run or the stroke would vanish from the committed paper.
  // The degraded corner that comes with it: with no entry above this fold, its
  // ink outside LOWER entries' rects survives every deeper undo (a full-paper
  // snapshot used to wipe it). Accepted — keeping a child's stroke while
  // losing its undo step beats deleting ink — but it means the restore
  // induction (see restorePatch) is conditional on every fold having pushed
  // its entry (all patches or none — a partial capture couldn't cover the
  // fold). No rects isn't a failure: the fold won't touch the paper, so the
  // entry legitimately carries no pixels.
  if (!captureFailed) {
    snapshotStack.push({
      wasEmpty: cmd.wasEmpty,
      patches,
      pending: [...pendingCommands],
    });
    while (snapshotStack.length > MAX_UNDO_STACK_SIZE) snapshotStack.shift();
  }
  if (PERF_MARKS) performance.measure('engine.snapshot', 'engine.snapshot:start');
  pendingCommands.push(cmd);
  if (PERF_MARKS) performance.mark('engine.fold:start');
  foldPendingIntoPaper(foldCount);
  if (PERF_MARKS) performance.measure('engine.fold', 'engine.fold:start');
  encodeColdSnapshots();
  reinflateHotSnapshots();
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

function isInLiveWindow(snap: Snapshot): boolean {
  const i = snapshotStack.indexOf(snap);
  return i >= 0 && i >= snapshotStack.length - K_LIVE;
}

// Demotion may only trust a blob that is plausibly the lossless encoding it
// asked for: WebP (Chromium and Firefox 105+ encode quality-1 WebP
// losslessly) or the spec-mandated toBlob fallback PNG (lossless everywhere;
// Safari has no canvas WebP encoder and always takes it). Anything else —
// null, empty, or an unexpected type from a nonconforming engine — fails
// here, and the entry keeps its live raster instead: more memory, but undo
// stays byte-exact. Exported as the unit-test seam for the validation rule.
export function isValidColdSnapshotBlob(blob: Blob | null): blob is Blob {
  return (
    blob !== null && blob.size > 0 && (blob.type === 'image/webp' || blob.type === 'image/png')
  );
}

// Demote snapshots below the K_LIVE window to encoded blobs, freeing their
// patch rasters (stroke-sized; worst case the full ~30 MB paper for a clear or
// a canvas-spanning scribble). WebP first (Chromium encodes quality-1 WebP losslessly at a
// fraction of PNG's size); engines that can't encode WebP hand back a PNG blob
// (per spec toBlob falls back to image/png), which is lossless everywhere.
// The returned blob is validated before the raster is dropped — see
// isValidColdSnapshotBlob. An entry that rose into the live window while its
// encode was in flight keeps the raster it never lost.
function encodeColdSnapshots() {
  for (let i = 0; i < snapshotStack.length - K_LIVE; i++) {
    const snap = snapshotStack[i];
    for (const patch of snap.patches) {
      if (!patch.canvas || patch.blob || patch.encoding) continue;
      const source = patch.canvas;
      patch.encoding = true;
      source.toBlob(
        (blob) => {
          patch.encoding = false;
          if (!isValidColdSnapshotBlob(blob)) return; // bad encode — keep the raster
          if (patch.canvas === source && isInLiveWindow(snap)) return;
          patch.blob = blob;
          if (patch.canvas === source) patch.canvas = null;
        },
        'image/webp',
        1
      );
    }
  }
}

// Re-inflate encoded entries that rise into the K_LIVE window — undo popping
// the stack, or a commit landing on an undo-shallowed one — so the "K_LIVE
// most recent snapshots are live rasters" invariant survives undo-then-draw
// instead of only holding while the stack grows. Fire-and-forget off the hot
// path, like the encode tier; it never touches the paper, so it cannot race
// the undo/paper chain — a re-inflating entry popped for undo mid-decode
// fails the isInLiveWindow re-check and popSnapshot's own decode stays the
// single restore path.
function reinflateHotSnapshots() {
  for (let i = Math.max(0, snapshotStack.length - K_LIVE); i < snapshotStack.length; i++) {
    const snap = snapshotStack[i];
    for (const patch of snap.patches) {
      if (patch.canvas || !patch.blob || patch.decoding) continue;
      const source = patch.blob;
      patch.decoding = true;
      createImageBitmap(source).then(
        (bitmap) => {
          patch.decoding = false;
          if (patch.canvas || patch.blob !== source || !isInLiveWindow(snap)) {
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
          patch.canvas = live;
          patch.blob = null;
        },
        () => {
          patch.decoding = false; // decode failed — keep the blob; deep undo retries it
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
export function popSnapshot(): Promise<{ wasEmpty: boolean; rects: PatchRect[] }> | null {
  const snap = snapshotStack.pop();
  if (!snap) return null;
  pendingCommands = [...snap.pending];
  reinflateHotSnapshots();
  const rects = snap.patches.map((p) => p.rect);
  // No patches means this commit's fold never touched the paper, so undoing
  // it is just the pending-set reinstatement above.
  if (snap.patches.length === 0) return Promise.resolve({ wasEmpty: snap.wasEmpty, rects });
  if (snap.patches.every((p) => p.canvas)) {
    for (const p of snap.patches) restorePatch(p.canvas!, p.rect);
    return Promise.resolve({ wasEmpty: snap.wasEmpty, rects });
  }
  // Decode every demoted patch, then restore the whole entry in one pass (the
  // rects are disjoint, so within-entry order is immaterial). Invariant: a
  // stacked patch always holds its canvas or its blob — encode drops the
  // raster only after a validated blob lands (encodeColdSnapshots), and
  // re-inflation drops the blob only after the raster lands
  // (reinflateHotSnapshots), so the null-null branch is unreachable. It must
  // stay that way: it skips that patch's restore blit, leaving the paper
  // wrong. The error is a tripwire for a refactor that breaks the invariant;
  // the return semantics are deliberately unchanged.
  return Promise.all(
    snap.patches.map(async (p) => {
      if (p.canvas) return { source: p.canvas as CanvasImageSource, rect: p.rect, bitmap: null };
      if (!p.blob) {
        console.error('Undo snapshot lost both canvas and blob; restore blit skipped');
        return null;
      }
      const bitmap = await createImageBitmap(p.blob);
      return { source: bitmap as CanvasImageSource, rect: p.rect, bitmap };
    })
  ).then((restores) => {
    for (const r of restores) {
      if (!r) continue;
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
function restorePatch(source: CanvasImageSource, rect: PatchRect) {
  if (!paperCtx) return;
  paperPristine = false;
  paperCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
  paperCtx.drawImage(source, rect.x, rect.y);
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
export function repaintAll(target: CanvasRenderingContext2D) {
  // Replaying the open pass's ops below rebuilds its crayon accumulation from
  // scratch; the live buffers must start empty so a non-idempotent deposit
  // can never double-composite on a repaint (see strokeOps).
  resetLiveCrayonForReplay(target);
  clearAllOf(target);
  if (paperCanvas) target.drawImage(paperCanvas, 0, 0);
  for (const cmd of pendingCommands) for (const op of cmd.ops) renderOp(target, op);
  for (const cmd of deferredCommands) for (const op of cmd.ops) renderOp(target, op);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(target, op);
  }
}

// Test/profiling seam: how the undo history is currently stored. `liveRasters`
// counts ENTRIES still holding any patch canvas (≤ K_LIVE + entries whose
// encode hasn't landed — entry-level on purpose: the settle gates in
// engine.spec.ts and scripts/perf/undo-scenarios.mjs compare it against
// K_LIVE, and a multi-patch entry would overshoot a patch-level count) and
// `rasterBytes` is the live patches' actual pixel cost (w × h × 4 —
// patch-sized since ADR-0069, per-cluster since ADR-0074); `blobBytes` is the
// encoded tier's total size — together the history memory the perf harness
// reports; `pendingCommands` counts commands the unready magic sheet is
// holding out of the paper.
export function getHistoryDebug(): {
  snapshots: number;
  liveRasters: number;
  rasterBytes: number;
  blobBytes: number;
  pendingCommands: number;
} {
  return {
    snapshots: snapshotStack.length,
    liveRasters: snapshotStack.reduce((n, s) => n + (s.patches.some((p) => p.canvas) ? 1 : 0), 0),
    rasterBytes: snapshotStack.reduce(
      (n, s) =>
        n +
        s.patches.reduce((m, p) => m + (p.canvas ? p.canvas.width * p.canvas.height * 4 : 0), 0),
      0
    ),
    blobBytes: snapshotStack.reduce(
      (n, s) => n + s.patches.reduce((m, p) => m + (p.blob?.size ?? 0), 0),
      0
    ),
    pendingCommands: pendingCommands.length,
  };
}
