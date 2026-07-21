// Undo history: a committed "paper" raster + a bounded stack of pre-stroke
// snapshots (ADR-0066, reversing ADR-0033's command replay).
//
// The paper is one offscreen raster (a max(w,h) square) holding the committed
// drawing. Every commit pushes a copy of the pre-stroke paper onto the
// snapshot stack, then folds the stroke's ops in — so undo, resize, remount,
// and export are all blits (plus the in-flight stroke), never command replays.
// The copy cost is one full-canvas drawImage at pointerup; it buys O(blit)
// undo at any stroke complexity and frees every brush from replay-determinism
// constraints (ADR-0065's crayon was the forcing case).
//
// Memory is tiered: the K_LIVE most recent snapshots stay live rasters
// (~30 MB each at 2× DPR on a 13″ iPad — instant common undo); older entries
// are encoded to a lossless blob off the commit path and decoded again only on
// deep undo, so a deep stack costs megabytes, not hundreds of them. The tier
// re-balances in both directions: undo (or a commit on an undo-shallowed
// stack) can raise an encoded entry into the K_LIVE window, and it re-inflates
// back to a live raster off the hot path (reinflateHotSnapshots), so the
// window holds after undo-then-draw, not only while the stack grows.
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
import { isMagicSheetUnready } from './magicBrush';
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

interface Snapshot {
  wasEmpty: boolean;
  canvas: HTMLCanvasElement | null;
  blob: Blob | null;
  encoding: boolean;
  decoding: boolean;
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

// Commit: push the pre-stroke paper state, then fold the new command in.
// Inside the surrounding engine.commit measure, engine.snapshot isolates the
// paper-copy cost and engine.fold isolates rendering the committed ops onto
// the paper — the two pointerup hitch candidates, kept apart so a hot commit
// can be attributed to the right one.
export function pushCommand(cmd: StrokeGroupCommand) {
  if (!paperCanvas || !paperCtx) return;
  if (PERF_MARKS) performance.mark('engine.snapshot:start');
  const copy = document.createElement('canvas');
  copy.width = paperCanvas.width;
  copy.height = paperCanvas.height;
  const copyCtx = copy.getContext('2d');
  // A failed copy context loses this one undo entry, never the ink — the fold
  // below must still run or the stroke would vanish from the committed paper.
  if (copyCtx) {
    copyCtx.drawImage(paperCanvas, 0, 0);
    snapshotStack.push({
      wasEmpty: cmd.wasEmpty,
      canvas: copy,
      blob: null,
      encoding: false,
      decoding: false,
      pending: [...pendingCommands],
    });
    while (snapshotStack.length > MAX_UNDO_STACK_SIZE) snapshotStack.shift();
  }
  if (PERF_MARKS) performance.measure('engine.snapshot', 'engine.snapshot:start');
  pendingCommands.push(cmd);
  if (PERF_MARKS) performance.mark('engine.fold:start');
  foldPendingIntoPaper();
  if (PERF_MARKS) performance.measure('engine.fold', 'engine.fold:start');
  encodeColdSnapshots();
  reinflateHotSnapshots();
}

// Fold committed-but-unfolded commands into the paper, oldest first, stopping
// at the first one the unready magic sheet would render blank. Ordering is
// preserved by construction: nothing after a blocked command folds either.
function foldPendingIntoPaper() {
  if (!paperCtx) return;
  while (pendingCommands.length > 0) {
    const cmd = pendingCommands[0];
    if (commandHasMagic(cmd) && isMagicSheetUnready()) break;
    pendingCommands.shift();
    for (const op of cmd.ops) renderOp(paperCtx, op);
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
// ~30 MB rasters. WebP first (Chromium encodes quality-1 WebP losslessly at a
// fraction of PNG's size); engines that can't encode WebP hand back a PNG blob
// (per spec toBlob falls back to image/png), which is lossless everywhere.
// The returned blob is validated before the raster is dropped — see
// isValidColdSnapshotBlob. An entry that rose into the live window while its
// encode was in flight keeps the raster it never lost.
function encodeColdSnapshots() {
  for (let i = 0; i < snapshotStack.length - K_LIVE; i++) {
    const snap = snapshotStack[i];
    if (!snap.canvas || snap.blob || snap.encoding) continue;
    const source = snap.canvas;
    snap.encoding = true;
    source.toBlob(
      (blob) => {
        snap.encoding = false;
        if (!isValidColdSnapshotBlob(blob)) return; // bad encode — keep the raster
        if (snap.canvas === source && isInLiveWindow(snap)) return;
        snap.blob = blob;
        if (snap.canvas === source) snap.canvas = null;
      },
      'image/webp',
      1
    );
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
    if (snap.canvas || !snap.blob || snap.decoding) continue;
    const source = snap.blob;
    snap.decoding = true;
    createImageBitmap(source).then(
      (bitmap) => {
        snap.decoding = false;
        if (snap.canvas || snap.blob !== source || !isInLiveWindow(snap)) {
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
        snap.canvas = live;
        snap.blob = null;
      },
      () => {
        snap.decoding = false; // decode failed — keep the blob; deep undo retries it
      }
    );
  }
}

// Pop the top snapshot and restore it as the committed paper state. A live
// raster restores synchronously; a demoted entry decodes from its blob first,
// so the caller repaints when the promise resolves. Null when nothing is
// undoable.
export function popSnapshot(): Promise<{ wasEmpty: boolean }> | null {
  const snap = snapshotStack.pop();
  if (!snap) return null;
  pendingCommands = [...snap.pending];
  reinflateHotSnapshots();
  if (snap.canvas) {
    restorePaper(snap.canvas);
    return Promise.resolve({ wasEmpty: snap.wasEmpty });
  }
  // Invariant: a stacked entry always holds its canvas or its blob — encode
  // drops the raster only after a validated blob lands (encodeColdSnapshots),
  // and re-inflation drops the blob only after the raster lands
  // (reinflateHotSnapshots), so this branch is unreachable. It must stay that
  // way: it pops the stack but skips the restore blit, leaving the paper
  // wrong. The error is a tripwire for a refactor that breaks the invariant;
  // the return semantics are deliberately unchanged.
  if (!snap.blob) {
    console.error('Undo snapshot lost both canvas and blob; restore blit skipped');
    return Promise.resolve({ wasEmpty: snap.wasEmpty });
  }
  return createImageBitmap(snap.blob).then((bitmap) => {
    restorePaper(bitmap);
    bitmap.close();
    return { wasEmpty: snap.wasEmpty };
  });
}

function restorePaper(source: CanvasImageSource) {
  if (!paperCtx || !paperCanvas) return;
  paperCtx.clearRect(0, 0, paperCanvas.width, paperCanvas.height);
  paperCtx.drawImage(source, 0, 0);
}

export function snapshotCount(): number {
  return snapshotStack.length;
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
  clearAllOf(target);
  if (paperCanvas) target.drawImage(paperCanvas, 0, 0);
  for (const cmd of pendingCommands) for (const op of cmd.ops) renderOp(target, op);
  for (const cmd of deferredCommands) for (const op of cmd.ops) renderOp(target, op);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(target, op);
  }
}

// Test/profiling seam: how the undo history is currently stored. `liveRasters`
// counts snapshots still holding their ~30 MB canvas (≤ K_LIVE + entries whose
// encode hasn't landed); `blobBytes` is the encoded tier's total size — the
// deep-history memory cost the perf harness reports; `pendingCommands` counts
// commands the unready magic sheet is holding out of the paper.
export function getHistoryDebug(): {
  snapshots: number;
  liveRasters: number;
  blobBytes: number;
  pendingCommands: number;
} {
  return {
    snapshots: snapshotStack.length,
    liveRasters: snapshotStack.reduce((n, s) => n + (s.canvas ? 1 : 0), 0),
    blobBytes: snapshotStack.reduce((n, s) => n + (s.blob?.size ?? 0), 0),
    pendingCommands: pendingCommands.length,
  };
}
