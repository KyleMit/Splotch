// Undo history: one baseline raster + a bounded log of replayable commands.
//
// The baseline is one offscreen raster (a max(w,h) square) holding the state
// from before the oldest retained command. Undo = redraw this, then replay the
// surviving command log on top. A single raster replaces the old stack of
// full-canvas snapshots (ADR-0033). Commands whose simplified ops are still
// expensive to re-stroke are collapsed into cumulative raster keyframes
// (ADR-0035).
//
// All of this state deliberately outlives the engine's teardown()/init cycles:
// client-side navigation (`/` → `/privacy` → `/`) must not wipe the child's
// drawing, so remount replays the retained log onto the fresh canvas. The
// cost — the rasters stay resident while no canvas is mounted — is accepted
// (ADR-0004).

import {
  clearAllOf,
  commandSegmentCount,
  renderOp,
  type StrokeGroupCommand,
  type StrokeOp,
} from './strokeOps';
import { simplifyCommandOps } from './commandSimplify';
import { isMagicSheetUnready } from './magicBrush';
import { PERF_MARKS } from './perf';

// The retained command log; commands older than this fold into the baseline.
// Depth is cheap in memory — retained commands hold simplified op lists
// (kilobytes), and rasters are bounded separately by the single baseline +
// MAX_KEYFRAMES — so the cap trades only worst-case replay time (undo/resize
// rebuilds). 20 keeps a child from hitting the wall mid-correction (raised
// from 10 after user feedback). Exported as the fold-boundary test seam.
export const MAX_UNDO_STACK_SIZE = 20;
// Each keyframe is a full baseline-sized raster (a max(w,h) square at up to 2×
// DPR ≈ 30 MB on an iPad), so the ≤ MAX_UNDO_STACK_SIZE retained commands could
// otherwise pin hundreds of MB — enough to get a WKWebView killed on older
// iPads. Cap how many coexist: creating a new keyframe folds older keyframed
// history into the baseline (see capKeyframeMemory).
const MAX_KEYFRAMES = 1;
const commandLog: StrokeGroupCommand[] = [];

let baselineCanvas: HTMLCanvasElement | null = null;
let baselineCtx: CanvasRenderingContext2D | null = null;

// The stroke group currently being drawn (opened on first paint, pushed to the
// log when the last finger lifts), so a multi-touch gesture undoes as a single
// unit.
let activeCommand: StrokeGroupCommand | null = null;

// Keyframe safety net (ADR-0035, now downstream of ADR-0036 simplification).
// Simplification already collapses a normal long scribble to tens of segments,
// so the common case stays cheap replayable ops. A pathological high-detail
// gesture (a finger held down for a minute, every frame a real direction change)
// can still leave more segments than we want to re-stroke on every undo, so a
// command whose *simplified* segment total passes this bound is baked into a
// cumulative raster keyframe (once, at commit, off the draw frame) and its ops
// dropped — keeping worst-case undo at one drawImage blit. Set well above the
// segment counts real drawing produces (peak ~140 in profiled sessions) so it
// fires only for genuine outliers. Mutable so the profiling harness can raise it
// to Infinity to isolate pure-simplification fidelity (see setKeyframeSegmentThreshold).
let keyframeSegmentThreshold = 384;

export function setKeyframeSegmentThreshold(threshold: number) {
  keyframeSegmentThreshold = threshold;
}

// A max(w,h) square of the paper covers both orientations, so rotation never
// loses pixels; anything larger (e.g. a resized desktop window) goes through
// the grow path, copying existing pixels so no drawing is lost. Replayed ops
// use the baseline's coordinates, and content off the current viewport survives
// here even though the visible canvas clips it. Fresh/grown contexts get the
// round line cap/join because the fold path strokes ops directly onto them.
export function ensureBaselineCovers(squareSide: number) {
  if (!baselineCanvas) {
    baselineCanvas = document.createElement('canvas');
    baselineCanvas.width = squareSide;
    baselineCanvas.height = squareSide;
    baselineCtx = baselineCanvas.getContext('2d');
    if (baselineCtx) {
      baselineCtx.lineCap = 'round';
      baselineCtx.lineJoin = 'round';
    }
    return;
  }
  if (squareSide <= baselineCanvas.width && squareSide <= baselineCanvas.height) return;
  const grown = document.createElement('canvas');
  grown.width = Math.max(squareSide, baselineCanvas.width);
  grown.height = Math.max(squareSide, baselineCanvas.height);
  const grownCtx = grown.getContext('2d');
  if (grownCtx) {
    grownCtx.lineCap = 'round';
    grownCtx.lineJoin = 'round';
    grownCtx.drawImage(baselineCanvas, 0, 0);
  }
  baselineCanvas = grown;
  baselineCtx = grownCtx;
}

// Baseline dimensions for surfaces that must match it (keyframes).
function baselineSize(): { width: number; height: number } | null {
  return baselineCanvas ? { width: baselineCanvas.width, height: baselineCanvas.height } : null;
}

// Open the undo command for a new stroke group. `wasEmpty` is the canvas-empty
// state before the group drew, captured so undo can restore the flag.
export function beginCommand(wasEmpty: boolean) {
  activeCommand = { ops: [], wasEmpty };
}

// Append an op to the active stroke-group command so it can be replayed for
// undo. No-op between groups (activeCommand is null).
export function recordOp(op: StrokeOp) {
  if (activeCommand) activeCommand.ops.push(op);
}

// Finalize the stroke group built up since beginCommand() and push it onto the
// undo log. Called once per group, when the last finger lifts. Returns false
// when no group was open (nothing painted).
export function commitActiveCommand(): boolean {
  if (!activeCommand) return false;
  pushCommand(activeCommand);
  activeCommand = null;
  return true;
}

export function pushCommand(cmd: StrokeGroupCommand) {
  commandLog.push(cmd);
  cmd.ops = simplifyCommandOps(cmd.ops);
  while (commandLog.length > MAX_UNDO_STACK_SIZE) {
    if (!foldOldestIntoBaseline()) break;
  }
  maybeKeyframe(cmd);
}

// Remove and return the most recent command, or null when nothing is undoable.
export function popCommand(): StrokeGroupCommand | null {
  return commandLog.pop() ?? null;
}

export function commandCount(): number {
  return commandLog.length;
}

// A clear can arrive while a stroke straddles it (e.g. a second finger drawing
// while drag-to-clear completes). That stroke's command commits *after* the
// clear command on lift, so its pre-clear ops must be dropped or every rebuild
// would replay them on top of the clear, resurrecting wiped ink. The command
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

// Safety net: a command whose *simplified* segment total is still large enough
// to make undo/resize replay expensive is collapsed once, at commit (off the
// draw frame), into a cumulative square keyframe of the whole drawing through it,
// then its ops are dropped so rebuilds blit the keyframe instead. Built before
// the ops are cleared, so paintStateThrough still sees them. See ADR-0035 (the
// trigger now measures post-simplification segments, ADR-0036).
function maybeKeyframe(cmd: StrokeGroupCommand) {
  const size = baselineSize();
  if (commandSegmentCount(cmd) <= keyframeSegmentThreshold || !size) return;
  const index = commandLog.indexOf(cmd);
  if (index < 0) return;
  if (hasMagicAwaitingDecodeThrough(index)) return;
  const kf = document.createElement('canvas');
  kf.width = size.width;
  kf.height = size.height;
  const kfCtx = kf.getContext('2d');
  if (!kfCtx) return;
  kfCtx.lineCap = 'round';
  kfCtx.lineJoin = 'round';
  if (PERF_MARKS) performance.mark('engine.keyframe:start');
  paintStateThrough(kfCtx, index);
  cmd.keyframe = kf;
  cmd.ops = [];
  if (PERF_MARKS) performance.measure('engine.keyframe', 'engine.keyframe:start');
  capKeyframeMemory();
}

// Bound retained keyframe rasters to MAX_KEYFRAMES. A newly created keyframe is
// the only thing that can push the count over, so fold the oldest commands into
// the baseline until the cap holds again. foldOldestIntoBaseline blits a
// keyframed command wholesale, so the older raster's pixels survive in the
// baseline (undo popping the newer keyframe then repaints from there) — we trade
// undo depth past the folded keyframe for a hard memory ceiling. Keyframes fire
// only for pathological outliers, so real sessions never reach this.
function capKeyframeMemory() {
  while (keyframeCount() > MAX_KEYFRAMES && commandLog.length > 0) {
    if (!foldOldestIntoBaseline()) break;
  }
}

function keyframeCount(): number {
  let n = 0;
  for (const cmd of commandLog) if (cmd.keyframe) n++;
  return n;
}

// History past the cap can no longer be undone, so bake the oldest command into
// the baseline raster and drop it. A keyframed command already holds the
// cumulative state through itself, so it becomes the new baseline wholesale;
// otherwise replay its ops in order (keeping eraser destination-out ops hitting
// exactly the pixels they originally did).
function foldOldestIntoBaseline(): boolean {
  const oldest = commandLog[0];
  if (!oldest || !baselineCtx || !baselineCanvas) return false;
  if (commandHasMagic(oldest) && isMagicSheetUnready()) return false;
  commandLog.shift();
  if (PERF_MARKS) performance.mark('engine.foldBaseline:start');
  if (oldest.keyframe) {
    baselineCtx.clearRect(0, 0, baselineCanvas.width, baselineCanvas.height);
    baselineCtx.drawImage(oldest.keyframe, 0, 0);
  } else {
    for (const op of oldest.ops) renderOp(baselineCtx, op);
  }
  if (PERF_MARKS) performance.measure('engine.foldBaseline', 'engine.foldBaseline:start');
  return true;
}

function commandHasMagic(command: StrokeGroupCommand): boolean {
  return command.ops.some((op) => (op.kind === 'dot' || op.kind === 'path') && op.magic);
}

// An unready sheet makes renderOp intentionally paint no magic pixels (a pending
// fill decode, or a sheet that hasn't rasterized). Keyframing and dropping any
// command's ops in that state would make the omission permanent.
function hasMagicAwaitingDecodeThrough(index: number): boolean {
  if (!isMagicSheetUnready()) return false;
  for (let i = 0; i <= index; i++) {
    if (commandHasMagic(commandLog[i])) return true;
  }
  return false;
}

// Paint the drawing state through commandLog[upToIndex] (inclusive) onto a
// target context. Starts from the most recent cumulative keyframe at or below
// that index (a keyframe is the whole drawing through its command, so blitting
// it replaces the baseline + every command up to it) and replays only the ops
// after it. With no keyframe in range it falls back to the baseline + a full
// replay. The baseline/keyframes are square (max(w,h)), so painting onto a
// resized or rotated visible canvas restores content that was off-screen.
export function paintStateThrough(target: CanvasRenderingContext2D, upToIndex: number) {
  let start = -1;
  for (let i = upToIndex; i >= 0; i--) {
    if (commandLog[i].keyframe) {
      start = i;
      break;
    }
  }
  clearAllOf(target);
  let begin: number;
  if (start >= 0) {
    target.drawImage(commandLog[start].keyframe!, 0, 0);
    begin = start + 1;
  } else {
    if (baselineCanvas) target.drawImage(baselineCanvas, 0, 0);
    begin = 0;
  }
  for (let i = begin; i <= upToIndex; i++) {
    for (const op of commandLog[i].ops) renderOp(target, op);
  }
}

// Reconstruct the full drawing (baseline + command log, via the most recent
// keyframe) onto a target. A mid-stroke resize still has an uncommitted
// activeCommand (its ops are recorded but not yet in the log, and it is never
// keyframed until commit), so replay it last to keep the in-flight stroke;
// between strokes activeCommand is null and that step is a no-op.
export function replayAll(target: CanvasRenderingContext2D) {
  paintStateThrough(target, commandLog.length - 1);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(target, op);
  }
}

// Test/profiling seam: how the undo history is currently stored. `keyframes`
// counts commands collapsed to a cumulative raster (ADR-0035) vs. ones still
// held as replayable ops; `maxSegments` is the heaviest retained command's
// replay cost (post-simplification, ADR-0036); `totalSegments` is the cost of a
// full rebuild (every retained command's ops) — the perf proxy the sweep plots
// against fidelity. `maxOps` is retained for the profiling harness.
export function getHistoryDebug(): {
  commands: number;
  keyframes: number;
  maxOps: number;
  maxSegments: number;
  totalSegments: number;
} {
  return {
    commands: commandLog.length,
    keyframes: keyframeCount(),
    maxOps: commandLog.reduce((m, c) => Math.max(m, c.ops.length), 0),
    maxSegments: commandLog.reduce((m, c) => Math.max(m, commandSegmentCount(c)), 0),
    totalSegments: commandLog.reduce((m, c) => m + commandSegmentCount(c), 0),
  };
}
