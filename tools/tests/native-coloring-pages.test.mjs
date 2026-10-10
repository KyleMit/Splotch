import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addStroke,
  changePage,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  COLORING_PAGES,
  PAGE_IDS,
} from '../../experiments/native-architecture/src/drawing/pages.ts';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import {
  reopenPicture,
  savePicture,
} from '../../experiments/native-architecture/src/platform/drawingFiles.web.ts';

function legacyStroke() {
  return { color: 'Green', brush: 'marker', points: [{ x: 512, y: 384 }] };
}

function stroke() {
  return { ...strokeStyle('marker', 'Green', emptyDrawing()), points: legacyStroke().points };
}

function picture() {
  return addStroke(changePage(createHistory(), 'flower'), stroke());
}

afterEach(() => vi.unstubAllGlobals());

describe('native coloring-page composition', () => {
  it('changes the page and paint together as one reversible picture operation', () => {
    const original = picture();
    const next = changePage(original, 'turtle');
    expect(next.drawing).toEqual({ ...original.drawing, pageId: 'turtle' });
    expect(next.drawing.strokes).toBe(original.drawing.strokes);
    expect(next.undo.at(-1)).toBe(original.drawing);
    expect(undoDrawing(next).drawing).toBe(original.drawing);
    expect(original.drawing.strokes).toEqual([stroke()]);
  });

  it('retains mixed brush metadata and one page Undo unit through page removal and later ink', () => {
    const strokes = [
      { brush: 'magic', width: 30, rainbow: 3, points: [{ x: 512, y: 384 }] },
      { brush: 'crayon', width: 34, color: 'Blue', seed: 20, points: [{ x: 300, y: 384 }] },
      { brush: 'eraser', width: 44, points: [{ x: 400, y: 384 }] },
      stroke(),
    ];
    const original = createHistory({ ...emptyDrawing(3, 'flower'), strokes });
    const changed = changePage(original, 'sunshine');
    const removed = changePage(changed, 'blank');
    expect(changed.drawing.strokes).toBe(strokes);
    expect(removed.drawing.strokes).toBe(strokes);
    expect(removed.drawing.rainbow).toBe(3);
    expect(changed.undo).toEqual([original.drawing]);
    expect(undoDrawing(removed).drawing).toBe(changed.drawing);
    expect(undoDrawing(undoDrawing(removed)).drawing).toBe(original.drawing);
    const painted = addStroke(changed, stroke());
    expect(undoDrawing(painted).drawing).toBe(changed.drawing);
    expect(parseDrawing(JSON.parse(JSON.stringify(removed.drawing)))).toEqual(removed.drawing);
  });

  it('keeps the page through new ink and undoable clear', () => {
    const original = picture();
    const cleared = clearDrawing(original, false);
    expect(original.drawing.pageId).toBe('flower');
    expect(cleared.drawing).toEqual(emptyDrawing(1, 'flower'));
    expect(undoDrawing(cleared).drawing).toBe(original.drawing);
    const visuallyEmpty = clearDrawing(cleared, true);
    expect(visuallyEmpty.drawing).toEqual(emptyDrawing(2, 'flower'));
    expect(visuallyEmpty.undo).toBe(cleared.undo);
  });

  it('leaves the painted picture and history intact when its page is selected again', () => {
    const original = picture();
    expect(changePage(original, 'flower')).toBe(original);
  });

  it('returns to blank paper without discarding the undoable painted page', () => {
    const original = picture();
    const blank = changePage(original, 'blank');
    expect(blank.drawing).toEqual({ ...original.drawing, pageId: 'blank' });
    expect(blank.drawing.strokes).toBe(original.drawing.strokes);
    expect(undoDrawing(blank).drawing).toBe(original.drawing);
  });

  it.each(PAGE_IDS)(
    'round-trips the %s composition through the supported saved format',
    (pageId) => {
      const drawing = addStroke(changePage(createHistory(), pageId), stroke()).drawing;
      expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
      expect(COLORING_PAGES[pageId].label).toBeTruthy();
    }
  );

  it.each([undefined, null, '', 'foreign', 'toString', {}, 1])(
    'refuses an invalid page identity from storage %#',
    (pageId) => {
      expect(() => parseDrawing({ version: 2, pageId, strokes: [] })).toThrow(
        'This saved picture contains an invalid coloring page.'
      );
    }
  );

  it.each([undefined, null, '', 'foreign', 'toString', {}, 1])(
    'refuses invalid legacy joint-format page identity %#',
    (pageId) => {
      expect(() => parseDrawing({ version: 3, rainbow: 0, pageId, strokes: [] })).toThrow(
        'This saved picture contains an invalid coloring page.'
      );
    }
  );

  it.each([undefined, null, '', 'foreign', 'toString', {}, 1])(
    'refuses invalid current-format page identity %#',
    (pageId) => {
      expect(() => parseDrawing({ ...emptyDrawing(), pageId })).toThrow(
        'This saved picture contains an invalid coloring page.'
      );
    }
  );

  it('refuses a missing current-format stroke width while accepting the complete record', () => {
    const drawing = picture().drawing;
    expect(parseDrawing(drawing)).toEqual(drawing);
    expect(() => parseDrawing({ ...drawing, strokes: [legacyStroke()] })).toThrow(
      'This saved picture contains an invalid stroke width.'
    );
  });

  it('opens the first native slice’s saved pictures as blank paper', () => {
    expect(parseDrawing({ version: 1, strokes: [legacyStroke()] })).toEqual({
      ...emptyDrawing(),
      strokes: [stroke()],
    });
  });

  it('holds the selected page and ink at the export cut while a later page changes', async () => {
    const original = picture();
    const captures = createPngCapture();
    const request = captures.begin(original.drawing);
    const next = changePage(original, 'sunshine');
    expect(request.drawing).toBe(original.drawing);
    expect(request.drawing).toEqual({ ...emptyDrawing(0, 'flower'), strokes: [stroke()] });
    expect(next.drawing.pageId).toBe('sunshine');
    expect(request.complete('snapshot PNG')).toBe(true);
    await expect(request.promise).resolves.toBe('snapshot PNG');
  });

  it('saves and reopens the full page composition through the browser storage adapter', async () => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    values.set(
      'splotch-picture:picture-1-first',
      JSON.stringify({ version: 1, strokes: [legacyStroke()] })
    );
    await expect(reopenPicture('picture-1-first')).resolves.toEqual({
      ...emptyDrawing(),
      strokes: [stroke()],
    });
    const original = picture().drawing;
    const saved = await savePicture(original);
    const opened = await reopenPicture(saved.id);
    expect(opened).toEqual(original);
    values.set(`splotch-picture:${saved.id}`, JSON.stringify({ ...original, pageId: 'unknown' }));
    const refused = values.get(`splotch-picture:${saved.id}`);
    await expect(reopenPicture(saved.id)).rejects.toThrow(
      'This saved picture contains an invalid coloring page.'
    );
    expect(values.get(`splotch-picture:${saved.id}`)).toBe(refused);
  });
});
