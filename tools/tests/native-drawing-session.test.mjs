import { expect, it } from 'vitest';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import {
  addStroke,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { paperProjection } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  INITIAL_PAPER_PRESENTATION,
  presentPaper,
} from '../../experiments/native-architecture/src/drawing/paperPresentation.ts';
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
  const firstBlank = first.currentDrawing();
  const secondBlank = second.currentDrawing();
  expect(firstBlank).toEqual(emptyDrawing(firstBlank.rainbow));
  expect(secondBlank).toEqual(emptyDrawing(secondBlank.rainbow));
  first.setHistory((history) =>
    addStroke(history, { ...STROKE, brush: 'pen', width: 14 }, canonicalPaper())
  );
  expect(first.currentDrawing().strokes).toHaveLength(1);
  expect(second.currentDrawing()).toBe(secondBlank);
  expect(second.getSnapshot().undo).toEqual([]);
  first.setHistory(undoDrawing);
  expect(first.currentDrawing()).toBe(firstBlank);
});

it('retains a per-paper resized extent across drawing owners and Undo without adding history', () => {
  const session = createDrawingSession();
  const paper = canonicalPaper();
  session.setHistory((history) =>
    addStroke(history, { ...STROKE, brush: 'pen', width: 14 }, paper)
  );
  const history = session.getSnapshot();
  const inputs = {
    paper,
    empty: false,
    slot: { width: 1500, height: 900 },
    window: { width: 1500, height: 900 },
    origin: { x: 0, y: 0 },
    toolbarStyle: 'bare',
  };
  const presentation = presentPaper(INITIAL_PAPER_PRESENTATION, inputs);
  session.paperPresentations.set(paper, presentation);
  expect(session.getSnapshot()).toBe(history);
  expect(session.paperPresentations.get(paper).extent).toEqual(inputs.slot);
  expect(paperProjection(paper, session.paperPresentations.get(paper).extent).paper).toBe(paper);
  expect(createDrawingSession().paperPresentations.get(paper)).toBeUndefined();
});
