// Commit-time stroke simplification (ADR-0036).
//
// A finger drawing records one path op per frame, so a single stroke can hold
// hundreds of near-collinear samples that undo/resize re-stroke segment by
// segment. When a command commits, its ops are reduced once: per finger, the
// run of path ops is rebuilt into its raw point list and thinned with
// Ramer–Douglas–Peucker — a point is dropped when it lies within an
// epsilon-tolerance of the chord between its surviving neighbours, so only real
// direction changes remain. The rendered curve already approximates rather than
// interpolates its points, so thinning them shifts only antialiased stroke
// edges (<1px), not the stroke's shape or position.
//
// This module owns the tunables and the command-level orchestration (regroup a
// multi-touch command's interleaved ops by finger, split each finger's ops into
// continuous same-style runs, reduce each run); the per-run geometry pipelines
// live in strokeSimplify.ts.

import { sampleReducedSpans, splineReducedSpans } from './strokeSimplify';
import type { PathOp, StrokeOp } from './strokeOps';
import { PERF_MARKS } from './perf';

// The RDP tolerance scales with stroke width: a wiggle far smaller than the
// round brush's radius can't be seen, so a thick stroke tolerates a coarser
// polyline than a thin one. Clamped so even the thinnest stroke drops sub-pixel
// jitter and the thickest doesn't cut visible corners. All in device px —
// stored coordinates already include renderScale.
// Mutable so the dev profiling harness can sweep them at runtime
// (setSimplifyOptions, exposed only on the dev/engine page behind
// PUBLIC_ENABLE_DEV_HARNESS). Production never calls the setter, so these keep
// their tuned defaults.
let epsilonFraction = 0.03;
let epsilonMinPx = 1;
let epsilonMaxPx = 6;

function epsilonFor(lineWidth: number): number {
  return Math.min(epsilonMaxPx, Math.max(epsilonMinPx, lineWidth * epsilonFraction));
}

// Turn threshold shared by the corner pinning/splitting in strokeSimplify.ts
// (cos of the corner angle; sharper turns than this are corners).
let cornerCos = Math.cos((40 * Math.PI) / 180);

// Rebuild renderer. 'samples' (the default) thins the recovered RAW finger
// samples and re-applies the live midpoint-quadratic construction over them
// (sampleReducedSpans, strokeSimplify.ts) — the SAME curve family as the live
// render, so turns, tips, and hold-still corners rebuild exactly and the
// whole-battery worst shift is ~1.5 CSS px (vs 2.5 for 'spline'). 'spline'
// interpolates derived ON-CURVE points (rawPointsOf) with a corner-aware
// centripetal Catmull-Rom — kept for comparison sweeps; it reduces more (~4.3×
// vs ~2.7×) at visibly lower corner/tip fidelity. 'midpoint' is a
// legacy/diagnostic mode that re-applies midpoint smoothing to ON-CURVE points;
// it HALVES them and is wrong for reconstruction (kept only for the profiling
// seam). Tunable via setSimplifyOptions.
export type SimplifyMode = 'midpoint' | 'spline' | 'samples';
let mode: SimplifyMode = 'samples';

// When false, keep every raw point (no RDP) — for measuring the renderer floor.
let reduce = true;

// 'corner' splits a reduced run into one stroke op per span between sharp corners,
// so each kept corner is a stroke boundary and gets a round CAP (a full disc) just
// like the live per-frame draw — eliminating the merged-path round-JOIN shift at
// sharp turns. 'none' emits one merged op per run (round joins at every vertex).
let split: 'none' | 'corner' = 'corner';

// SHIPPING DEFAULT: true. simplifyCommandOps reduces a committed command's
// per-frame ops to a few thinned sub-strokes (ADR-0036, 'samples' mode above).
// Verified on perf:units: every stroke in the synthetic + real battery rebuilds
// within ≤1.5 CSS px of the live render (max; the bulk far under), at ~2.7x
// fewer points. The key is staying in the live render's own curve family — thin
// the recovered raw samples, pin turn/tip/duplicate neighbourhoods so their
// local geometry is exact, and re-apply midpoint smoothing — instead of fitting
// a different spline through derived points (the retired 'spline' mode, which
// reduced more but shifted corners and scribble tips by up to 2.5 px: the jump
// users saw on undo). Long all-corners commands that RDP can't thin are still
// bounded by ADR-0035 keyframing.
let enabled = true;

// Lifetime counters (raw samples seen vs. points kept after simplification),
// surfaced through getUndoDebug for the profiling harness and the engine spec.
let rawPoints = 0;
let keptPoints = 0;

export function getSimplifyCounters(): { rawPoints: number; keptPoints: number } {
  return { rawPoints, keptPoints };
}

export interface SimplifyOptions {
  fraction?: number;
  min?: number;
  max?: number;
  cornerAngleDeg?: number;
  mode?: SimplifyMode;
  reduce?: boolean;
  enabled?: boolean;
  split?: 'none' | 'corner';
}

// Dev profiling seam (ADR-0036 tuning): override the simplification tolerances
// so a single build can sweep every setting. Wired onto window.__engine only on
// the /dev/engine page (PUBLIC_ENABLE_DEV_HARNESS); production never calls it.
// Resets the lifetime counters so each sweep point reads a clean raw/kept ratio.
export function setSimplifyOptions(params: SimplifyOptions) {
  if (params.fraction !== undefined) epsilonFraction = params.fraction;
  if (params.min !== undefined) epsilonMinPx = params.min;
  if (params.max !== undefined) epsilonMaxPx = params.max;
  if (params.cornerAngleDeg !== undefined)
    cornerCos = Math.cos((params.cornerAngleDeg * Math.PI) / 180);
  if (params.mode !== undefined) mode = params.mode;
  if (params.reduce !== undefined) reduce = params.reduce;
  if (params.enabled !== undefined) enabled = params.enabled;
  if (params.split !== undefined) split = params.split;
  rawPoints = 0;
  keptPoints = 0;
}

function pathStyleMatches(a: PathOp, b: PathOp): boolean {
  return (
    a.color === b.color &&
    a.lineWidth === b.lineWidth &&
    a.erase === b.erase &&
    !!a.magic === !!b.magic &&
    // A crayon run must not merge with a non-crayon one, and two crayon strokes
    // with different seeds must stay separate so each keeps its own tooth phase
    // (the buildup phase-shift — ADR-0065). Within one stroke every op shares the
    // seed, so a genuine run still reduces as a unit.
    !!a.crayon === !!b.crayon &&
    a.seed === b.seed
  );
}

// A multi-touch command interleaves several fingers' per-frame ops; regroup
// them so each finger's stroke reduces as one geometric run. Map order follows
// each pointer's first op, matching the original compositing order.
export function groupPathOpsByPointer(ops: StrokeOp[]): Map<number, PathOp[]> {
  const byPid = new Map<number, PathOp[]>();
  for (const op of ops) {
    if (op.kind !== 'path') continue;
    const list = byPid.get(op.pid);
    if (list) list.push(op);
    else byPid.set(op.pid, [op]);
  }
  return byPid;
}

// Split one finger's ops into spatially continuous, same-style runs. A
// pointer-resume jump (the next op doesn't start where the previous ended) or a
// mid-stroke style/eraser change breaks continuity, so no stray line bridges
// the gap when the run is rebuilt from its raw points.
export function splitIntoContinuousRuns(ops: PathOp[]): PathOp[][] {
  const runs: PathOp[][] = [];
  let run: PathOp[] = [];
  for (const op of ops) {
    if (run.length > 0) {
      const prev = run[run.length - 1];
      const prevAnchor = prev.segs[prev.segs.length - 1];
      const continuous = op.startX === prevAnchor.x && op.startY === prevAnchor.y;
      if (!continuous || !pathStyleMatches(prev, op)) {
        runs.push(run);
        run = [];
      }
    }
    run.push(op);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

// Reduce one continuous, same-style run of a single finger's path ops through
// the geometry pipeline for the active mode (strokeSimplify.ts), re-attach the
// run's style to each returned span, and track the lifetime raw/kept counters.
function reducePathRun(run: PathOp[]): PathOp[] {
  const first = run[0];
  const opts = { epsilon: epsilonFor(first.lineWidth), cornerCos, reduce };
  const { spans, rawCount, keptCount } =
    mode === 'samples'
      ? sampleReducedSpans(run, opts)
      : splineReducedSpans(run, { ...opts, midpoint: mode === 'midpoint', split });
  rawPoints += rawCount;
  keptPoints += keptCount;
  return spans.map((span) => ({
    kind: 'path' as const,
    pid: first.pid,
    startX: span.startX,
    startY: span.startY,
    segs: span.segs,
    color: first.color,
    lineWidth: first.lineWidth,
    erase: first.erase,
    magic: first.magic,
    crayon: first.crayon,
    seed: first.seed,
  }));
}

// Simplify a committed command's per-frame path ops. Each finger's reduced ops
// are emitted at the position of its first op; dots and clears pass through in
// place, preserving compositing order for the single-finger case. Returns the
// input array untouched when simplification is disabled or there's nothing to do.
export function simplifyCommandOps(ops: StrokeOp[]): StrokeOp[] {
  if (!enabled || ops.length === 0) return ops;
  if (PERF_MARKS) performance.mark('engine.simplify:start');

  const reducedByPid = new Map<number, PathOp[]>();
  for (const [pid, pathOps] of groupPathOpsByPointer(ops)) {
    // Crayon runs bypass thinning. RDP re-fits the polyline within ~1px — an
    // invisible AA shift for a solid stroke, but the crayon's tooth is BINARY,
    // so a texel at the re-fitted silhouette flips fully in or out and the
    // wax's byte-identical replay promise (ADR-0065) breaks at scribble
    // hairpins. Replaying the exact live ops is idempotent by construction;
    // ADR-0035 keyframing bounds the longer replay instead.
    reducedByPid.set(
      pid,
      splitIntoContinuousRuns(pathOps).flatMap((run) =>
        run[0].crayon && !run[0].erase ? run : reducePathRun(run)
      )
    );
  }

  const out: StrokeOp[] = [];
  const emitted = new Set<number>();
  for (const op of ops) {
    if (op.kind !== 'path') {
      out.push(op);
      continue;
    }
    if (!emitted.has(op.pid)) {
      out.push(...reducedByPid.get(op.pid)!);
      emitted.add(op.pid);
    }
  }
  if (PERF_MARKS) performance.measure('engine.simplify', 'engine.simplify:start');
  return out;
}
