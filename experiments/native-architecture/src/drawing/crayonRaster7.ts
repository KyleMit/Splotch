import {
  MERGED_MOVES_7,
  type Point7,
  type Style7,
  type Segment7,
  type Op7,
  type Granularity7,
} from './recordedTypes7';
import type { CrayonTracker7 } from './crayonTracker7';

export type Contact7 = {
  style: Style7;
  last: Point7;
  mid: Point7;
  seed: number;
  tracker: CrayonTracker7 | null;
  pending: Point7[][];
};

type RasterDeps7 = {
  active: Map<number, Contact7>;
  granularity: Granularity7;
  appendOp: (op: Op7) => void;
  charge: (count: number) => void;
  beforeForeign: (state: Contact7) => void;
  roll: (state: Contact7) => CrayonTracker7;
  credit: (state: Contact7, count: number) => void;
};
export function createRasterRouter7({
  active,
  granularity,
  appendOp,
  charge,
  beforeForeign,
  roll,
  credit,
}: RasterDeps7) {
  function smooth(contact: number, state: Contact7, points: readonly Point7[], count: number) {
    if (!points.length) return;
    beforeForeign(state);
    charge(points.length + 1);
    const start = state.mid;
    const segments: Segment7[] = [];
    for (const point of points) {
      const mid = { x: (state.last.x + point.x) / 2, y: (state.last.y + point.y) / 2 };
      segments.push({ cx: state.last.x, cy: state.last.y, ...mid });
      state.last = point;
      state.mid = mid;
    }
    appendOp(
      state.tracker
        ? { kind: 'crayonPath', contact, seed: state.seed, start, segments }
        : { kind: 'path', contact, start, segments }
    );
    credit(state, count);
  }
  function raster(contact: number, state: Contact7, points: readonly Point7[], count: number) {
    if (!state.tracker) return smooth(contact, state, points, count);
    let batch: Point7[] = [];
    let didSplit = false;
    for (const point of points) {
      if (state.tracker.advance(point) === 'split') {
        smooth(contact, state, batch, 0);
        batch = [];
        didSplit = true;
        roll(state).advance(point);
      }
      batch.push(point);
    }
    smooth(
      contact,
      state,
      batch,
      didSplit ? Math.round((count * batch.length) / points.length) : count
    );
  }
  function drain() {
    for (const [contact, state] of active) {
      const pending = state.pending;
      state.pending = [];
      let merged: Point7[] = [];
      let count = 0;
      for (const batch of pending) {
        if (state.tracker && granularity === 'per-move') raster(contact, state, batch, 1);
        else {
          for (const point of batch) merged.push(point);
          count++;
          if (state.tracker && count >= MERGED_MOVES_7) {
            raster(contact, state, merged, count);
            merged = [];
            count = 0;
          }
        }
      }
      if (merged.length) raster(contact, state, merged, count);
    }
  }
  return drain;
}
