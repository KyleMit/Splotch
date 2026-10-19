import { drawingPaper, type AdoptedPaper, type PaperReference } from './paperSpace';
import type { PaintColor } from './palette';
import {
  cohortFrame,
  sampleOutcome,
  strokeStyle,
  type Drawing,
  type Point,
  type Stroke,
  type StrokeOp,
  type StrokeStyle,
} from './model';
import type { Brush } from './brushes';
import { DEFAULT_STROKE_WIDTH, type StrokeWidth } from './strokeWidth';
import type { InkStep } from './inkOps';
import { PERF_PROBE, perfAppend, perfDrained } from './perfProbe';

// A stroke the cohort is still drawing. Its points and ops are its contact's own buffers, grown in
// place, so a kept sample costs O(1) rather than a copy of the stroke. `snapshot` is a new Stroke
// over the same buffers each time the stroke changes, so a consumer keyed on identity sees every
// change; an earlier snapshot reads the buffers as they grow. Nothing writes them once the cohort
// completes, so the last snapshot is the committed stroke and never changes again.
export type LiveStroke = Stroke &
  Readonly<{
    ops: readonly StrokeOp[];
    finished: () => boolean;
    snapshot: () => Stroke;
  }>;
export type LiveOp = InkStep<LiveStroke>;

type EntryState = { flushed: number; cached: Stroke | null; done: boolean };
type Entry = Readonly<{ stroke: LiveStroke; points: Point[]; ops: StrokeOp[]; state: EntryState }>;

function liveEntry(style: StrokeStyle, first: Point): Entry {
  const points = [first];
  const ops: StrokeOp[] = [];
  const state: EntryState = { flushed: 0, cached: null, done: false };
  const stroke: LiveStroke = {
    ...style,
    points,
    ops,
    finished: () => state.done,
    snapshot: () =>
      (state.cached ??= ops.length ? { ...style, points, ops } : { ...style, points }),
  };
  return { stroke, points, ops, state };
}

export function createContactCohort() {
  const active = new Map<string, number>();
  let entries: Entry[] = [];
  let paper: PaperReference | null = null;
  let frame = 0;
  // One drafts list per change to the cohort, so a consumer keyed on the list sees each change.
  let drafts: readonly Stroke[] | null = null;

  // Every sample taken since the last flush becomes ops in one frame: a stroke's first flush is
  // its dot, and each flush after paints the samples since as one path.
  function flush(): readonly LiveOp[] {
    const recorded: LiveOp[] = [];
    for (const entry of entries) {
      if (entry.state.flushed === entry.points.length) continue;
      if (entry.ops.length === 0) {
        entry.ops.push([1, frame]);
        recorded.push({ stroke: entry.stroke, op: 0 });
      }
      if (entry.points.length > 1 && entry.ops.at(-1)?.[0] !== entry.points.length) {
        entry.ops.push([entry.points.length, frame]);
        recorded.push({ stroke: entry.stroke, op: entry.ops.length - 1 });
      }
      entry.state.flushed = entry.points.length;
      entry.state.cached = null;
      drafts = null;
    }
    if (recorded.length > 0) frame += 1;
    return recorded;
  }

  function currentDrafts(): readonly Stroke[] {
    drafts ??= entries.map((entry) => entry.stroke.snapshot());
    return drafts;
  }

  // A cohort no renderer flushed keeps whole-stroke ops; one it did is flushed to its last sample.
  function drain(): readonly Stroke[] | null {
    if (active.size > 0 || entries.length === 0) return null;
    if (entries.some((entry) => entry.ops.length > 0)) flush();
    for (const entry of entries) entry.state.done = true;
    const completed = currentDrafts();
    entries = [];
    drafts = null;
    if (PERF_PROBE) perfDrained(completed);
    return completed;
  }

  return {
    start(
      identifier: string,
      color: PaintColor,
      brush: Brush,
      point: Point,
      drawing: Drawing,
      width: StrokeWidth = DEFAULT_STROKE_WIDTH,
      adoption?: () => AdoptedPaper
    ) {
      if (active.has(identifier)) return;
      if (active.size === 0) {
        const reference = drawingPaper(drawing);
        paper = reference.kind === 'unadopted' ? (adoption?.() ?? null) : reference;
        if (!paper) throw new Error('The drawing paper is not ready.');
        if (entries.length === 0) frame = cohortFrame(drawing);
      }
      const reserved = entries.findLast((entry) => entry.stroke.brush === 'crayon')?.stroke;
      const style = strokeStyle(
        brush,
        color,
        reserved ? { ...drawing, strokes: [reserved] } : drawing,
        width
      );
      active.set(identifier, entries.length);
      entries.push(liveEntry(style, point));
      drafts = null;
    },
    sample(identifier: string, point: Point) {
      const index = active.get(identifier);
      if (index === undefined) return;
      const entry = entries[index];
      // The responder keeps every sample that moved, a contact's last included.
      const outcome = sampleOutcome(entry.points, point, true);
      if (PERF_PROBE) perfAppend(outcome);
      if (outcome !== 'appended') return;
      entry.points.push(point);
      entry.state.cached = null;
      drafts = null;
    },
    finish(identifier: string): readonly Stroke[] | null {
      if (!active.delete(identifier)) return null;
      return drain();
    },
    interrupt(): readonly Stroke[] | null {
      active.clear();
      return drain();
    },
    hasActive(): boolean {
      return active.size > 0;
    },
    paper(): PaperReference {
      if (!paper) throw new Error('The drawing paper is not ready.');
      return paper;
    },
    drafts: currentDrafts,
    live(): readonly LiveStroke[] {
      return entries.map((entry) => entry.stroke);
    },
    flush,
  };
}

export type ContactCohort = ReturnType<typeof createContactCohort>;
