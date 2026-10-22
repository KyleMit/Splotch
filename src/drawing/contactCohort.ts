import { drawingPaper, type AdoptedPaper, type PaperReference } from './paperSpace';
import type { PaintColor } from './palette';
import {
  cohortFrame,
  nextCrayonSeed,
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
import { PERF_PROBE, perfAppend, perfDrained, perfFlushed } from './perfProbe';

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

// `opensPass`: a resumed contact's stroke whose first op is not recorded yet (see flush).
type EntryState = { flushed: number; cached: Stroke | null; done: boolean; opensPass: boolean };
type Entry = Readonly<{
  style: StrokeStyle;
  stroke: LiveStroke;
  points: Point[];
  ops: StrokeOp[];
  state: EntryState;
}>;

function liveEntry(style: StrokeStyle, first: Point, opensPass = false): Entry {
  const points = [first];
  const ops: StrokeOp[] = [];
  const state: EntryState = { flushed: 0, cached: null, done: false, opensPass };
  const stroke: LiveStroke = {
    ...style,
    points,
    ops,
    finished: () => state.done,
    snapshot: () =>
      (state.cached ??= ops.length ? { ...style, points, ops } : { ...style, points }),
  };
  return { style, stroke, points, ops, state };
}

// Numbers the frames a cohort's ops are painted in.
function createOpFrames() {
  let frame = 0;
  let recordedFrame = -Infinity;

  // A stroke's first flush is its dot, and each flush after paints the samples since as one path.
  function record(entry: Entry, recorded: LiveOp[]) {
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
    entry.state.opensPass = false;
  }

  function endFrame(recorded: readonly LiveOp[], before: number) {
    if (recorded.length === before) return;
    recordedFrame = frame;
    frame += 1;
  }

  // Every sample taken since the last flush becomes ops in one frame, in the order the strokes
  // began. A resumed contact's new stroke instead opens a frame one clear of every op before it:
  // the gap that separates cohorts, which closes the crayon glaze group live and on replay
  // (skiaInkLayer's joins), as shipping's rollToNextPass closes the pass. Strokes after it in the
  // cohort began after the resume, so they follow it into that frame.
  function flush(entries: readonly Entry[]): readonly LiveOp[] {
    const recorded: LiveOp[] = [];
    let frameStart = 0;
    for (const entry of entries) {
      if (entry.state.flushed === entry.points.length) continue;
      if (entry.state.opensPass) {
        endFrame(recorded, frameStart);
        if (recordedFrame === frame - 1) frame += 1;
        frameStart = recorded.length;
      }
      record(entry, recorded);
    }
    endFrame(recorded, frameStart);
    if (PERF_PROBE && recorded.length > 0) perfFlushed();
    return recorded;
  }

  return {
    flush,
    startCohort(drawing: Drawing) {
      frame = cohortFrame(drawing);
    },
  };
}

export function createContactCohort() {
  const active = new Map<string, number>();
  let entries: Entry[] = [];
  let paper: PaperReference | null = null;
  const frames = createOpFrames();
  // One drafts list per change to the cohort, so a consumer keyed on the list sees each change.
  let drafts: readonly Stroke[] | null = null;

  function flush(): readonly LiveOp[] {
    const recorded = frames.flush(entries);
    if (recorded.length > 0) drafts = null;
    return recorded;
  }

  const lastCrayon = () => entries.findLast((entry) => entry.stroke.brush === 'crayon')?.stroke;

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
        if (entries.length === 0) frames.startCohort(drawing);
      }
      const reserved = lastCrayon();
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
    // A contact whose stream resumed after a lift it never reported continues as a new stroke from
    // the resumed point, in this cohort so one Undo still takes it. A crayon's new stroke is a fresh
    // pass with the next grain seed, as shipping's crayonPasses.rollToNextPass gives it.
    resume(identifier: string, point: Point) {
      const index = active.get(identifier);
      if (index === undefined) return;
      const { style } = entries[index];
      const reserved = lastCrayon();
      active.set(identifier, entries.length);
      entries.push(
        liveEntry(
          style.brush === 'crayon'
            ? { ...style, seed: nextCrayonSeed(reserved ? [reserved] : []) }
            : style,
          point,
          true
        )
      );
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
