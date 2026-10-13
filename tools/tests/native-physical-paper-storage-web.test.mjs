import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { adoptPaper } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  savePicture,
  reopenPicture,
} from '../../experiments/native-architecture/src/platform/drawingFiles.web.ts';
import { legacyDrawing } from './native-paper-fixtures.mjs';

const MAX_SAVE_BYTES = 8 * 1024 * 1024;

function storageFixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
  vi.stubGlobal('localStorage', storage);
  return { values, storage };
}

function contactedDrawing(frame) {
  const initial = emptyDrawing(3, 'flower');
  const input = createContactCohort();
  const paper = adoptPaper(frame.width, frame.height, frame.pixelRatio);
  input.start('first', 'Red', 'crayon', { x: 200, y: 300 }, initial, 'extraThick', () => paper);
  input.start('second', 'Blue', 'pen', { x: 600, y: 300 }, initial, 'thin');
  expect(input.finish('first')).toBeNull();
  const history = addStrokes(createHistory(initial), input.finish('second'), input.paper());
  expect(history.drawing.paper).toBe(paper);
  expect(history.undo).toEqual([initial]);
  return history.drawing;
}

afterEach(() => vi.unstubAllGlobals());

describe('web actual adapter physical paper storage', () => {
  it.each([
    { width: 342, height: 256.5, pixelRatio: 1 },
    { width: 760, height: 570, pixelRatio: 3 },
  ])(
    'reopens adopted v6 contact paper and exact widths at %j under the save limit',
    async (frame) => {
      const { values } = storageFixture();
      const drawing = contactedDrawing(frame);
      const before = JSON.stringify(drawing);
      const saved = await savePicture(drawing);
      const reopened = await reopenPicture(saved.id);
      expect(reopened).toEqual(drawing);
      expect(reopened.version).toBe(6);
      expect(reopened.paper).toEqual({
        kind: 'adopted',
        cssWidth: frame.width,
        cssHeight: frame.height,
        backingScale: Math.min(frame.pixelRatio, 2),
      });
      expect(reopened.strokes.map(({ width }) => width)).toEqual([22, 4]);
      expect(JSON.stringify(drawing)).toBe(before);
      expect([...values.values()]).toEqual([JSON.stringify(parseDrawing(drawing))]);
      expect(Buffer.byteLength(before)).toBeLessThan(MAX_SAVE_BYTES);
    }
  );

  it.each(['unadopted-ink', 'foreign-paper-key'])(
    'rejects malformed current paper %s without publishing storage',
    async (fault) => {
      const { values, storage } = storageFixture();
      const drawing = contactedDrawing({ width: 342, height: 256.5, pixelRatio: 1 });
      const paper =
        fault === 'unadopted-ink' ? { kind: 'unadopted' } : { ...drawing.paper, extra: true };
      await expect(savePicture({ ...drawing, paper })).rejects.toThrow();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(values.size).toBe(0);
    }
  );

  it('rejects a different paper adoption without publishing storage', () => {
    const { values, storage } = storageFixture();
    const drawing = contactedDrawing({ width: 342, height: 256.5, pixelRatio: 1 });
    expect(() =>
      addStrokes(createHistory(drawing), [drawing.strokes[0]], adoptPaper(760, 570, 1))
    ).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it('reopens legacy v5 without adding paper or rewriting canonical width and seed', async () => {
    const { values } = storageFixture();
    const drawing = {
      ...legacyDrawing(),
      strokes: [
        { brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [{ x: 200, y: 300 }] },
      ],
    };
    const saved = await savePicture(drawing);
    expect(await reopenPicture(saved.id)).toEqual(drawing);
    expect(Object.hasOwn(parseDrawing(drawing), 'paper')).toBe(false);
    expect([...values.values()]).toEqual([JSON.stringify(parseDrawing(drawing))]);
  });
});
