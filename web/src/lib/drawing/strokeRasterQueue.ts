// Per-frame rasterization of a live stroke.
//
// A digitizer samples faster than the display presents — measured at 1.9-4.2
// contact moves per painted frame on the iPad. Rasterizing inside the event
// handler therefore paints the same presentable frame two to four times over,
// and every one of those passes pays a stroke per intersecting tile plus the
// renderer's own per-op bookkeeping. Queuing the points and rasterizing them as
// one op per frame keeps the ink identical (the op carries every sample as its
// own quadratic segment, exactly as a coalesced batch already did) while paying
// the per-op cost once.
import type { Point } from './strokeMath';
import { PERF_MARKS } from './perf';

// A main-thread stall accumulates every queued move into one flush, and a
// single merged crayon op's bounding box strictly contains the union of its
// pieces' boxes — selecting tiles the ink never enters, each paying two
// pattern passes and a possible backing allocation. Cap how many moves one
// crayon op may merge; within-pass parity (pass-scoped pattern seed,
// idempotent binary-alpha wax) makes the extra op boundary invisible.
const CRAYON_MERGED_MOVES_CAP = 8;

export type RasterBatch = { points: Point[]; at: number };

// The subset of the engine's pointer state this needs. Kept structural rather
// than importing PointerState so the queue does not depend on the whole engine.
export type RasterPointer = {
  pendingRaster: RasterBatch[];
  crayon: boolean;
  erase: boolean;
  x: number;
  y: number;
  lastTime: number;
};

// How crayon batches become wax-deposition ops. The right answer differs by
// runtime and the caller owns that choice (the engine derives it from
// __IS_CAPACITOR__ at compile time): Safari pays more per path-length so
// per-move ops win there (merging measured 1.57% -> 2.11% of in-contact frame
// time), while the WKWebView pays more per op so per-frame merging wins there
// (1.74% -> 1.46% on the same iPad, same day — issue 1236; splitting further
// to per-sample ops cost 3.07%). Every other brush merges everywhere.
//
// A dependency rather than a compile-time literal (contrast PERF_MARKS below,
// which must fold away so the release seam scan stays meaningful): both
// granularities must stay testable under vitest, whose define pins
// __IS_CAPACITOR__ true and would dead-code-eliminate whichever branch the
// web build ships. The engine's value IS the compile-time literal; only this
// module's branch is runtime, on a cold path (one comparison per flushed
// batch).
type CrayonOpGranularity = 'per-move' | 'per-frame';

export type StrokeRasterQueueDeps<P extends RasterPointer> = {
  activePointers: Map<number, P>;
  crayonOpGranularity: CrayonOpGranularity;
  // The shorter paper edge, used to scale the resume heuristic's jump distance.
  paperMinEdge: () => number;
  pointerWasResumed: (elapsed: number, jump: number, paperMinEdge: number) => boolean;
  restartStrokeIfResumed: (ps: P, point: Point, at: number) => void;
  strokeSpeed: (ps: P, last: Point, now: number) => number;
  strokeSegments: (ps: P, points: Point[], moveCount: number) => void;
  onFlushed: (speed: number) => void;
  // EXPERIMENT (exp/crayon-i2-frame-restamp): fires once per drained frame
  // after every pointer's ops have been rasterized.
  onDrainEnd?: () => void;
};

export function createStrokeRasterQueue<P extends RasterPointer>(deps: StrokeRasterQueueDeps<P>) {
  let rasterFrame = 0;

  function flushPointer(ps: P) {
    const queued = ps.pendingRaster;
    if (queued.length === 0) return;
    ps.pendingRaster = [];
    let merged: Point[] = [];
    let mergedMoves = 0;
    let speed = 0;
    for (const batch of queued) {
      // A resume is a lift the stream never reported, so the points either side
      // of it belong to different strokes and must not join into one op.
      const jump = Math.hypot(batch.points[0].x - ps.x, batch.points[0].y - ps.y);
      if (
        merged.length > 0 &&
        deps.pointerWasResumed(batch.at - ps.lastTime, jump, deps.paperMinEdge())
      ) {
        deps.strokeSegments(ps, merged, mergedMoves);
        merged = [];
        mergedMoves = 0;
      }
      deps.restartStrokeIfResumed(ps, batch.points[0], batch.at);
      speed = deps.strokeSpeed(ps, batch.points[batch.points.length - 1], batch.at);
      if (ps.crayon && !ps.erase && deps.crayonOpGranularity === 'per-move') {
        // Crayon wax is deposited per op through two pattern passes into two
        // surfaces, so op shape is a real cost knob — see CrayonOpGranularity
        // for the per-runtime trade this branch implements.
        deps.strokeSegments(ps, batch.points, 1);
      } else {
        merged.push(...batch.points);
        mergedMoves += 1;
        if (ps.crayon && !ps.erase && mergedMoves >= CRAYON_MERGED_MOVES_CAP) {
          deps.strokeSegments(ps, merged, mergedMoves);
          merged = [];
          mergedMoves = 0;
        }
      }
      ps.lastTime = batch.at;
    }
    if (merged.length > 0) deps.strokeSegments(ps, merged, mergedMoves);
    deps.onFlushed(speed);
  }

  // The single place queued raster is drained, so BOTH the frame-scheduled path
  // and the synchronous one are attributed to `engine.draw`. When only the rAF
  // path was marked, the tail raster that a pointer-up flushes ran unmeasured:
  // on a physical iPad, 37 of 40 strokes had no engine.draw measure between their
  // final move and the lift, which under-reports engine JS in exactly the
  // captures used for attribution.
  //
  // PERF_MARKS is a compile-time literal, so this branch and its mark strings
  // fold away in a release build. Taking it as a runtime dependency instead
  // would defeat that and retain the marks, which is what the release seam scan
  // exists to catch.
  function drainQueues() {
    let drained = false;
    for (const ps of deps.activePointers.values()) {
      if (ps.pendingRaster.length > 0) drained = true;
    }
    if (!drained) return;
    if (PERF_MARKS) performance.mark('engine.draw:start');
    try {
      for (const ps of deps.activePointers.values()) flushPointer(ps);
      // EXPERIMENT (exp/crayon-i2-frame-restamp): one restamp per drained
      // frame, after every pointer's ops have grown the pending rects.
      deps.onDrainEnd?.();
    } finally {
      if (PERF_MARKS) {
        performance.mark('engine.draw:end');
        performance.measure('engine.draw', 'engine.draw:start', 'engine.draw:end');
      }
    }
  }

  function flushAll() {
    if (rasterFrame !== 0) {
      cancelAnimationFrame(rasterFrame);
      rasterFrame = 0;
    }
    drainQueues();
  }

  function schedule() {
    if (rasterFrame !== 0) return;
    rasterFrame = requestAnimationFrame(() => {
      rasterFrame = 0;
      drainQueues();
    });
  }

  return { flushPointer, flushAll, schedule };
}
