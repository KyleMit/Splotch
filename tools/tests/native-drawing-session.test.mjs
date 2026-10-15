import { expect, it } from 'vitest';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import {
  addStroke,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { canonicalPaper } from './native-paper-fixtures.mjs';

const STROKE = {
  color: 'Purple',
  points: [
    { x: 20, y: 20 },
    { x: 100, y: 100 },
  ],
};

it('gives separate app owners independent pictures and Undo', () => {
  const first = createDrawingSession();
  const second = createDrawingSession();
  first.setHistory((history) =>
    addStroke(history, { ...STROKE, brush: 'pen', width: 14 }, canonicalPaper())
  );
  expect(first.currentDrawing().strokes).toHaveLength(1);
  expect(second.currentDrawing()).toEqual(emptyDrawing());
  expect(second.getSnapshot().undo).toEqual([]);
  first.setHistory(undoDrawing);
  expect(first.currentDrawing()).toEqual(emptyDrawing());
});
