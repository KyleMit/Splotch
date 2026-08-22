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

export type StrokeRasterQueueDeps<P extends RasterPointer> = {
  activePointers: Map<number, P>;
  // The shorter paper edge, used to scale the resume heuristic's jump distance.
  paperMinEdge: () => number;
  pointerWasResumed: (elapsed: number, jump: number, paperMinEdge: number) => boolean;
  restartStrokeIfResumed: (ps: P, point: Point, at: number) => void;
  strokeSpeed: (ps: P, last: Point, now: number) => number;
  strokeSegments: (ps: P, points: Point[], moveCount: number) => void;
  onFlushed: (speed: number) => void;
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
      if (ps.crayon && !ps.erase) {
        // Crayon alone keeps one op per pointermove. Its wax is deposited per op
        // through two pattern passes into two surfaces, so a merged op paints a
        // longer path per stroke() call and lands a larger dirty region on the
        // preview planes — a cost the checkpoint accounting cannot give back.
        // Measured on the physical iPad at 2.0 moves per frame, merging cost
        // crayon 1.57% -> 2.11% of in-contact frame time; counting the checkpoint
        // in pointermoves recovered it only to 1.85%. Every other brush paints
        // one shape per op and coalesces cleanly.
        deps.strokeSegments(ps, batch.points, 1);
      } else {
        merged.push(...batch.points);
        mergedMoves += 1;
      }
      ps.lastTime = batch.at;
    }
    if (merged.length > 0) deps.strokeSegments(ps, merged, mergedMoves);
    deps.onFlushed(speed);
  }

  function flushAll() {
    if (rasterFrame !== 0) {
      cancelAnimationFrame(rasterFrame);
      rasterFrame = 0;
    }
    for (const ps of deps.activePointers.values()) flushPointer(ps);
  }

  function schedule() {
    if (rasterFrame !== 0) return;
    rasterFrame = requestAnimationFrame(() => {
      rasterFrame = 0;
      // PERF_MARKS is a compile-time literal, so this whole branch and its
      // mark strings fold away in a release build. Taking it as a runtime
      // dependency instead would defeat that and retain the marks, which is
      // what the release seam scan exists to catch.
      if (PERF_MARKS) performance.mark('engine.draw:start');
      try {
        for (const ps of deps.activePointers.values()) flushPointer(ps);
      } finally {
        if (PERF_MARKS) {
          performance.mark('engine.draw:end');
          performance.measure('engine.draw', 'engine.draw:start', 'engine.draw:end');
        }
      }
    });
  }

  return { flushPointer, flushAll, schedule };
}
