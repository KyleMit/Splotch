import { describe, expect, it } from 'vitest';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import {
  createHistory,
  addRecordedCohort,
  undoDrawing,
  clearDrawing,
  retainRecordedAllocation,
  parseDrawing,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
function emptyRecordedDrawing7() {
  return {
    version: 7,
    paper: { kind: 'unadopted' },
    pageId: 'blank',
    rainbow: 0,
    commands: [],
    seedCursor: 1,
  };
}
import { recordedPaintPlan7 } from '../../experiments/native-architecture/src/drawing/recordedPaintPlan7.ts';
import { parseRecordedDrawing7 } from '../../experiments/native-architecture/src/drawing/recordedDrawing7.ts';
const PAPER = { kind: 'adopted', cssWidth: 512, cssHeight: 384, backingScale: 2 };
const STYLE = { brush: 'crayon', color: 'Red', width: 8 };
function cohort(seed) {
  const owner = createRecordedContactCohort7(PAPER, 'per-frame', seed);
  owner.start('one', STYLE, { x: 10, y: 10 });
  owner.move('one', [{ x: 40, y: 20 }]);
  owner.drain();
  return owner.end('one');
}
describe('production v7 atomic history and retained paint boundary', () => {
  it('commits the exact immutable command and adopts paper with its allocation cursor', () => {
    const history = createHistory(emptyRecordedDrawing7());
    const completed = cohort(1);
    const next = addRecordedCohort(history, history.drawing, completed);
    expect(next.drawing.commands[0]).toBe(completed.command);
    expect(next.drawing.seedCursor).toBe(completed.seedCursor);
    expect(next.drawing.paper).toEqual(PAPER);
    expect(history.drawing.paper.kind).toBe('unadopted');
    expect(Object.isFrozen(next.drawing)).toBe(true);
  });
  it('rejects a stale base without adopting its paper or advancing the owner', () => {
    const history = createHistory(emptyRecordedDrawing7());
    expect(() => addRecordedCohort(history, { ...history.drawing }, cohort(1))).toThrow('changed');
    expect(history.drawing.seedCursor).toBe(1);
    expect(history.drawing.commands).toHaveLength(0);
  });
  it('retains the allocation high-water across Undo and Clear', () => {
    const history = createHistory(emptyRecordedDrawing7());
    const painted = addRecordedCohort(history, history.drawing, cohort(1));
    const undone = undoDrawing(painted);
    expect(undone.drawing.commands).toBe(history.drawing.commands);
    expect(undone.drawing.seedCursor).toBe(painted.drawing.seedCursor);
    expect(clearDrawing(painted, false).drawing.seedCursor).toBe(painted.drawing.seedCursor);
  });
  it('rejects a cohort that reuses a discarded pass allocation', () => {
    const history = createHistory(emptyRecordedDrawing7());
    const painted = addRecordedCohort(history, history.drawing, cohort(1));
    const undone = undoDrawing(painted);
    expect(() => addRecordedCohort(undone, undone.drawing, cohort(1))).toThrow('allocation');
    expect(undone.drawing.commands).toHaveLength(0);
  });
  it('persists an Undo allocation gap using the mandatory declared command start', () => {
    const history = createHistory(emptyRecordedDrawing7());
    const painted = addRecordedCohort(history, history.drawing, cohort(1));
    const undone = undoDrawing(painted);
    const fresh = addRecordedCohort(undone, undone.drawing, cohort(undone.drawing.seedCursor));
    expect(parseRecordedDrawing7(fresh.drawing)).toEqual(fresh.drawing);
    expect(fresh.drawing.commands[0].firstSeed).toBe(undone.drawing.seedCursor);
  });
  it('retains an abandoned allocation receipt after a rejected commit without painting', () => {
    const initial = createHistory(emptyRecordedDrawing7());
    const completed = cohort(1);
    const changed = clearDrawing(initial, true);
    expect(() => addRecordedCohort(changed, initial.drawing, completed)).toThrow('changed');
    const retained = retainRecordedAllocation(changed, initial.drawing, completed.seedCursor);
    expect(retained.drawing.commands).toHaveLength(0);
    expect(retained.allocationCursor7).toBe(completed.seedCursor);
    expect(parseDrawing(JSON.parse(JSON.stringify(retained.drawing)))).toEqual(retained.drawing);
    expect(retainRecordedAllocation(retained, initial.drawing, 1)).toBe(retained);
  });
  it('opens a recorded storage model through the same parser while keeping new default legacy', () => {
    const initial = createHistory(emptyRecordedDrawing7());
    const painted = addRecordedCohort(initial, initial.drawing, cohort(1));
    const saved = JSON.stringify(painted.drawing);
    expect(parseDrawing(JSON.parse(saved))).toEqual(painted.drawing);
    expect(emptyDrawing().version).toBe(6);
    expect(parseDrawing({ version: 1, strokes: [] }).version).toBe(5);
  });
  it('flushes web wax only at the retained shared flush and leaves an immutable open overlay', () => {
    const drawing = emptyRecordedDrawing7();
    const wax = { kind: 'crayonDot', contact: 0, seed: 1, at: { x: 1, y: 2 } };
    const pen = { kind: 'dot', contact: 1, at: { x: 3, y: 4 } };
    const preview = {
      paper: PAPER,
      styles: [STYLE, { brush: 'pen', color: 'Blue', width: 8 }],
      ops: [wax, pen],
    };
    const open = recordedPaintPlan7(drawing, preview, 'web');
    expect(open.units).toHaveLength(1);
    expect(open.units[0].paint.op).toBe(pen);
    expect(open.openWax[0].op).toBe(wax);
    const closed = recordedPaintPlan7(
      drawing,
      { ...preview, ops: [...preview.ops, { kind: 'crayonFlush' }] },
      'web'
    );
    expect(closed.units.map((unit) => unit.kind)).toEqual(['paint', 'wax']);
    expect(closed.openWax).toHaveLength(0);
    expect(preview.ops).toHaveLength(2);
  });
  it('keeps native per-op global order and exact retained quadratic controls', () => {
    const completed = cohort(1);
    const drawing = {
      ...emptyRecordedDrawing7(),
      paper: PAPER,
      commands: [completed.command],
      seedCursor: completed.seedCursor,
    };
    const plan = recordedPaintPlan7(drawing, null, 'native');
    const retained = completed.command.ops.filter((op) => op.kind !== 'crayonFlush');
    expect(plan.units.map((unit) => unit.paint.op)).toEqual(retained);
    const index = retained.findIndex((op) => op.kind === 'crayonPath');
    expect(plan.units[index].paint.op.segments).toBe(retained[index].segments);
    expect(plan.openWax).toHaveLength(0);
  });
});
