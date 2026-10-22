import { describe, expect, it } from 'vitest';
import { canonicalPaper, legacyDrawing } from './native-paper-fixtures.mjs';
import { createContactCohort } from '../../src/drawing/contactCohort.ts';
import {
  addStrokes,
  cohortFrame,
  createHistory,
  emptyDrawing,
  strokeStyle,
} from '../../src/drawing/model.ts';
import { parseDrawing, serializeDrawing } from '../../src/drawing/drawingFormat.ts';
import { orderedOps, opRange, rangeShape } from '../../src/drawing/inkOps.ts';
import {
  createCrayonPassTracker,
  crayonPassBreaks,
  crayonPasses,
} from '../../src/drawing/crayon.ts';

const PAPER = canonicalPaper();
const at = (x, y) => ({ x, y });
const pen = (points, ops) => ({ ...strokeStyle('pen', 'Blue', emptyDrawing()), points, ops });

function opened(cohort, id, point, drawing = emptyDrawing(), brush = 'pen') {
  cohort.start(id, 'Blue', brush, point, drawing, 'medium', () => PAPER);
}

describe('stroke ops in the saved drawing', () => {
  const points = [at(10, 10), at(20, 20), at(30, 25), at(40, 20)];
  const saved = (strokes) =>
    JSON.parse(JSON.stringify({ ...emptyDrawing(), paper: PAPER, strokes }));

  it('saves a session as version 8 and reads its ops back', () => {
    const history = addStrokes(
      createHistory(),
      [
        pen(points, [
          [1, 4],
          [3, 4],
          [4, 5],
        ]),
      ],
      PAPER
    );
    expect(history.drawing.version).toBe(8);
    const read = parseDrawing(saved(history.drawing.strokes));
    expect(read.version).toBe(8);
    expect(read.strokes[0].ops).toEqual([
      [1, 4],
      [3, 4],
      [4, 5],
    ]);
  });

  it('reads version 7 and version 8 strokes without ops as single-op strokes', () => {
    const v7 = { ...saved([pen(points)]), version: 7 };
    const read = parseDrawing(v7);
    expect(read.version).toBe(7);
    expect(read.strokes[0].ops).toBeUndefined();
    expect(opRange(read.strokes[0], 0)).toEqual({ from: 0, to: 4 });
    expect(parseDrawing(saved([pen(points)])).strokes[0].ops).toBeUndefined();
    const upgraded = addStrokes(
      createHistory(read),
      [
        pen(points, [
          [1, 0],
          [4, 0],
        ]),
      ],
      PAPER
    );
    expect(upgraded.drawing.version).toBe(8);
    expect(upgraded.drawing.strokes[0]).toBe(read.strokes[0]);
  });

  it.each([
    [
      'ops in a version 7 picture',
      { version: 7 },
      [
        [1, 0],
        [4, 0],
      ],
    ],
    ['no ops', {}, []],
    [
      'a first op past the dot',
      {},
      [
        [2, 0],
        [4, 0],
      ],
    ],
    [
      'an op that does not advance',
      {},
      [
        [1, 0],
        [1, 0],
        [4, 0],
      ],
    ],
    [
      'ops short of the last point',
      {},
      [
        [1, 0],
        [3, 0],
      ],
    ],
    [
      'ops past the last point',
      {},
      [
        [1, 0],
        [5, 0],
      ],
    ],
    [
      'a frame that runs backwards',
      {},
      [
        [1, 3],
        [4, 2],
      ],
    ],
    [
      'a fractional end',
      {},
      [
        [1, 0],
        [2.5, 0],
        [4, 0],
      ],
    ],
    [
      'a negative frame',
      {},
      [
        [1, -1],
        [4, 0],
      ],
    ],
    [
      'an op that is not a pair',
      {},
      [
        [1, 0, 0],
        [4, 0],
      ],
    ],
  ])('refuses a saved picture with %s', (_, drawing, ops) => {
    expect(() => parseDrawing({ ...saved([pen(points, ops)]), ...drawing })).toThrow(
      /invalid (stroke op|brush)/
    );
  });

  // Negative control: dropping the ops as the stroke commits leaves its saved form unchanged but
  // replays the open picture's cohort whole (native-incremental-ink.test.mjs).
  it('keeps the ops of an open version 5 picture and saves it without them', () => {
    const ops = [
      [1, 0],
      [4, 0],
    ];
    const history = addStrokes(createHistory(legacyDrawing()), [pen(points, ops)]);
    expect(history.drawing.version).toBe(5);
    expect(history.drawing.strokes[0].ops).toEqual(ops);
    expect(() => parseDrawing(JSON.parse(JSON.stringify(history.drawing)))).toThrow();
    const reread = parseDrawing(JSON.parse(serializeDrawing(history.drawing)));
    expect(reread.version).toBe(5);
    expect(reread.strokes[0].ops).toBeUndefined();
    expect(reread.strokes[0].points).toEqual(points);
  });

  it('saves an op-carrying session through the same serializer, ops included', () => {
    const history = addStrokes(
      createHistory(),
      [
        pen(points, [
          [1, 0],
          [4, 1],
        ]),
      ],
      PAPER
    );
    expect(parseDrawing(JSON.parse(serializeDrawing(history.drawing)))).toEqual(history.drawing);
  });

  it('continues each op from the point before its first, as shipping continues from its pen', () => {
    const stroke = pen(points, [
      [1, 0],
      [3, 0],
      [4, 1],
    ]);
    expect(rangeShape(stroke.points, opRange(stroke, 0))).toEqual({ points: [points[0]] });
    expect(rangeShape(stroke.points, opRange(stroke, 1))).toEqual({
      points: points.slice(0, 3),
      lead: undefined,
    });
    expect(rangeShape(stroke.points, opRange(stroke, 2))).toEqual({
      points: points.slice(2, 4),
      lead: points[1],
    });
  });
});

describe('the paint order of a drawing', () => {
  it('interleaves a cohort by frame and keeps cohorts and op-less strokes in drawing order', () => {
    const a = pen(
      [at(0, 0), at(1, 1), at(2, 2)],
      [
        [1, 0],
        [2, 1],
        [3, 3],
      ]
    );
    const b = pen(
      [at(5, 5), at(6, 6)],
      [
        [1, 1],
        [2, 2],
      ]
    );
    const legacy = pen([at(9, 9)]);
    const c = pen([at(7, 7)], [[1, 5]]);
    const order = orderedOps([a, b, legacy, c]).map(
      ({ stroke, op }) =>
        [
          ['a', a],
          ['b', b],
          ['legacy', legacy],
          ['c', c],
        ].find(([, item]) => item === stroke)[0] + op
    );
    expect(order).toEqual(['a0', 'a1', 'b0', 'b1', 'a2', 'legacy0', 'c0']);
  });

  it('starts every cohort a frame past the last one, so cohorts never share adjacent frames', () => {
    expect(cohortFrame(emptyDrawing())).toBe(0);
    const drawing = { ...emptyDrawing(), strokes: [pen([at(0, 0)], [[1, 7]]), pen([at(1, 1)])] };
    expect(cohortFrame(drawing)).toBe(9);
  });
});

describe('the live cohort records ops as frames flush', () => {
  it('records a dot, then one path op per flush that took samples', () => {
    const cohort = createContactCohort();
    opened(cohort, 'a', at(10, 10));
    cohort.sample('a', at(20, 10));
    expect(cohort.flush().map(({ op }) => op)).toEqual([0, 1]);
    expect(cohort.flush()).toEqual([]);
    cohort.sample('a', at(30, 10));
    cohort.sample('a', at(30, 10));
    cohort.sample('a', at(40, 10));
    expect(cohort.flush().map(({ op }) => op)).toEqual([2]);
    expect(cohort.live()[0].ops).toEqual([
      [1, 0],
      [2, 0],
      [4, 1],
    ]);
  });

  it('flushes every contact in the order they started, all in one frame', () => {
    const cohort = createContactCohort();
    const drawing = { ...emptyDrawing(), strokes: [pen([at(0, 0)], [[1, 3]])] };
    opened(cohort, 'a', at(10, 10), drawing);
    cohort.flush();
    opened(cohort, 'b', at(50, 50), drawing);
    cohort.sample('a', at(20, 10));
    const [first, second] = cohort.live();
    expect(cohort.flush()).toEqual([
      { stroke: first, op: 1 },
      { stroke: second, op: 0 },
    ]);
    expect(first.ops).toEqual([
      [1, 5],
      [2, 6],
    ]);
    expect(second.ops).toEqual([[1, 6]]);
  });

  it('commits one undo unit per cohort only after its last contact ends, each stroke whole', () => {
    const cohort = createContactCohort();
    opened(cohort, 'a', at(10, 10));
    opened(cohort, 'b', at(50, 50));
    cohort.flush();
    cohort.sample('a', at(20, 10));
    cohort.sample('b', at(60, 50));
    expect(cohort.finish('a')).toBeNull();
    cohort.sample('b', at(70, 50));
    const [a, b] = cohort.live();
    const completed = cohort.finish('b');
    expect(completed).toEqual([a.snapshot(), b.snapshot()]);
    expect(a.finished() && b.finished()).toBe(true);
    expect(completed.map((stroke) => stroke.ops.at(-1)[0])).toEqual([2, 3]);
    const history = addStrokes(createHistory(), completed, PAPER);
    expect(history.undo).toHaveLength(1);
    expect(history.drawing.strokes).toEqual(completed);
  });

  it('leaves a cohort no renderer flushed as whole strokes', () => {
    const cohort = createContactCohort();
    opened(cohort, 'a', at(10, 10));
    cohort.sample('a', at(20, 10));
    const [stroke] = cohort.finish('a');
    expect(stroke.ops).toBeUndefined();
    expect(stroke.points).toEqual([at(10, 10), at(20, 10)]);
  });

  it('publishes a new stroke and drafts list per change, over the contact’s own buffer', () => {
    const cohort = createContactCohort();
    opened(cohort, 'a', at(10, 10));
    const [live] = cohort.live();
    const first = live.snapshot();
    const drafts = cohort.drafts();
    expect(live.snapshot()).toBe(first);
    expect(cohort.drafts()).toBe(drafts);
    cohort.sample('a', at(20, 10));
    expect(live.snapshot()).not.toBe(first);
    expect(cohort.drafts()).not.toBe(drafts);
    expect(live.snapshot().points).toBe(first.points);
    expect(first.points).toEqual([at(10, 10), at(20, 10)]);
    const last = cohort.drafts();
    expect(cohort.finish('a')).toBe(last);
  });
});

describe('crayon passes found one point at a time', () => {
  it('splits a stroke where the whole-stroke passes split it', () => {
    const scribble = [
      ...Array.from({ length: 30 }, (_, index) => at(100 + index * 12, 200 + (index % 3))),
      ...Array.from({ length: 30 }, (_, index) => at(460 - index * 12, 210 + (index % 2))),
      ...Array.from({ length: 30 }, (_, index) => at(110 + index * 12, 205)),
    ];
    const stroke = { brush: 'crayon', color: 'Red', seed: 3, width: 22, points: scribble };
    const breaks = crayonPassBreaks(scribble, 22);
    expect(breaks.length).toBeGreaterThan(1);
    const passes = crayonPasses(stroke, 22);
    expect(passes).toHaveLength(breaks.length + 1);
    expect(passes.slice(1).map((pass) => pass.points[1])).toEqual(
      breaks.map((index) => scribble[index])
    );
    const tracker = createCrayonPassTracker(scribble[0], 22);
    const incremental = scribble
      .slice(1)
      .flatMap((point, index) => (tracker.advance(point) ? [index + 1] : []));
    expect(incremental).toEqual(breaks);
  });
});
