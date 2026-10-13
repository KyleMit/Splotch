import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import { addRecordedCommand7 } from '../../experiments/native-architecture/src/drawing/recordedHistory7.ts';
import { adoptPaper } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  recordedPaintPlan7,
  recordedSceneUnits7,
} from '../../experiments/native-architecture/src/drawing/recordedPaintPlan7.ts';

const CRAYON = { brush: 'crayon', color: 'Red', width: 22 };
const PEN = { brush: 'pen', color: 'Blue', width: 22 };
const ERASER = { brush: 'eraser', width: 44 };
const POINT = { x: 100, y: 400 };
const CASES = [
  [760, 570, 1],
  [342, 256.5, 1],
  [512, 384, 2],
];
function blank(paper) {
  return { version: 7, paper, pageId: 'blank', rainbow: 0, seedCursor: 1, commands: [] };
}
function ops(units) {
  return units.flatMap((unit) =>
    unit.kind === 'wax' ? unit.paints.map((paint) => paint.op) : [unit.paint.op]
  );
}
function oldPlacement(plan) {
  return { nested: plan.units, outside: plan.openWax };
}

describe('recorded scene terminal wax continuity', () => {
  it.each(CASES)(
    'keeps drained live and atomic committed scene units equal at %s/%s DPR%s',
    (width, height, dpr) => {
      const paper = adoptPaper(width, height, dpr);
      const drawing = blank(paper);
      const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
      cohort.start('one', CRAYON, POINT);
      cohort.move('one', [{ x: 600, y: 400 }]);
      cohort.drain();
      const live = cohort.snapshot();
      const liveBefore = JSON.stringify(live);
      const cursor = cohort.allocationCursor();
      const activePlan = recordedPaintPlan7(drawing, live, 'web');
      const completed = cohort.end('one');
      const committed = addRecordedCommand7(drawing, completed);
      const endedPlan = recordedPaintPlan7(committed, null, 'web');
      expect(activePlan.openWax.length).toBeGreaterThan(0);
      expect(endedPlan.openWax).toHaveLength(0);
      expect(oldPlacement(activePlan)).not.toEqual(oldPlacement(endedPlan));
      expect(recordedSceneUnits7(activePlan)).toEqual(recordedSceneUnits7(endedPlan));
      expect(completed.command.ops.at(-1)).toEqual({ kind: 'crayonFlush' });
      expect(completed.command.ops.slice(0, -1)).toEqual(live.ops);
      expect(committed.seedCursor).toBe(cursor);
      expect(JSON.stringify(live)).toBe(liveBefore);
      expect(drawing.commands).toHaveLength(0);
    }
  );

  it('retains multiple shared flush boundaries instead of merging all wax into one pass', () => {
    const paper = adoptPaper(760, 570, 1);
    const drawing = blank(paper);
    const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
    cohort.start('one', CRAYON, POINT);
    for (let delivery = 1; delivery <= 65; delivery++) {
      cohort.move('one', [{ x: 100 + delivery, y: 400 }]);
      cohort.drain();
    }
    const live = cohort.snapshot();
    const activePlan = recordedPaintPlan7(drawing, live, 'web');
    expect(activePlan.units.length).toBeGreaterThan(0);
    expect(activePlan.openWax.length).toBeGreaterThan(0);
    const units = recordedSceneUnits7(activePlan);
    const completed = cohort.end('one');
    const endedPlan = recordedPaintPlan7(addRecordedCommand7(drawing, completed), null, 'web');
    expect(units).toEqual(recordedSceneUnits7(endedPlan));
    expect(units).toHaveLength(activePlan.units.length + 1);
    expect(units[0]).toBe(activePlan.units[0]);
    expect(units.at(-1).paints).toBe(activePlan.openWax);
    expect(units.length).toBeGreaterThan(1);
    expect(ops(units)).toEqual(live.ops.filter((op) => op.kind !== 'crayonFlush'));
  });

  it('preserves native operation order and mixed Pen/eraser placement from the real cohort', () => {
    const paper = adoptPaper(342, 256.5, 1);
    const drawing = blank(paper);
    const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
    cohort.start('wax', CRAYON, POINT);
    cohort.move('wax', [{ x: 200, y: 400 }]);
    cohort.drain();
    cohort.start('pen', PEN, { x: 300, y: 200 });
    cohort.move('pen', [{ x: 350, y: 200 }]);
    cohort.drain();
    expect(cohort.end('pen')).toBeNull();
    cohort.start('erase', ERASER, { x: 150, y: 400 });
    cohort.move('erase', [{ x: 170, y: 400 }]);
    cohort.drain();
    expect(cohort.end('erase')).toBeNull();
    const live = cohort.snapshot();
    const nativePlan = recordedPaintPlan7(drawing, live, 'native');
    expect(nativePlan.openWax).toHaveLength(0);
    expect(recordedSceneUnits7(nativePlan)).toBe(nativePlan.units);
    expect(ops(recordedSceneUnits7(nativePlan))).toEqual(
      live.ops.filter((op) => op.kind !== 'crayonFlush')
    );
    const webPlan = recordedPaintPlan7(drawing, live, 'web');
    const paints = recordedSceneUnits7(webPlan).filter((unit) => unit.kind === 'paint');
    expect(paints.map((unit) => unit.paint.style.brush)).toEqual([
      'pen',
      'pen',
      'eraser',
      'eraser',
    ]);
    const completed = cohort.end('wax');
    const committed = addRecordedCommand7(drawing, completed);
    expect(recordedSceneUnits7(webPlan)).toEqual(
      recordedSceneUnits7(recordedPaintPlan7(committed, null, 'web'))
    );
    expect(ops(recordedSceneUnits7(recordedPaintPlan7(committed, null, 'native')))).toEqual(
      completed.command.ops.filter((op) => op.kind !== 'crayonFlush')
    );
  });

  it('keeps pending delivered geometry visible at end rather than forcing a false equality', () => {
    const paper = adoptPaper(760, 570, 1);
    const drawing = blank(paper);
    const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
    cohort.start('one', CRAYON, POINT);
    const live = cohort.snapshot();
    cohort.move('one', [{ x: 600, y: 400 }]);
    const completed = cohort.end('one');
    const activeUnits = recordedSceneUnits7(recordedPaintPlan7(drawing, live, 'web'));
    const endedUnits = recordedSceneUnits7(
      recordedPaintPlan7(addRecordedCommand7(drawing, completed), null, 'web')
    );
    expect(activeUnits).not.toEqual(endedUnits);
    expect(ops(activeUnits)).toHaveLength(1);
    expect(ops(endedUnits).some((op) => op.kind === 'crayonPath')).toBe(true);
  });

  it('does not mutate or unfreeze immutable plans, paint arrays, or retained operations', () => {
    const paper = adoptPaper(760, 570, 1);
    const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
    cohort.start('one', CRAYON, POINT);
    const plan = recordedPaintPlan7(blank(paper), cohort.snapshot(), 'web');
    const before = JSON.stringify(plan);
    const units = recordedSceneUnits7(plan);
    expect(Object.isFrozen(units)).toBe(true);
    expect(Object.isFrozen(units.at(-1))).toBe(true);
    expect(units.at(-1).paints).toBe(plan.openWax);
    expect(() => units.push(units[0])).toThrow();
    expect(() => units.at(-1).paints.push(units.at(-1).paints[0])).toThrow();
    expect(JSON.stringify(plan)).toBe(before);
    cohort.cancel();
  });

  it('routes the real renderer through the shared indexed traversal without an external open-wax sibling', () => {
    const source = readFileSync(
      new URL(
        '../../experiments/native-architecture/src/drawing/RecordedSceneContent7.tsx',
        import.meta.url
      ),
      'utf8'
    );
    expect(source).toContain('recordedSceneUnits7(plan).entries()');
    expect(source).not.toContain('plan.openWax.length ?');
    expect(source).toContain('<RecordedWax7 key={index} paints={unit.paints} />');
  });
});
