import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addStroke,
  changePage,
  clearDrawing,
  createHistory,
  parseDrawing,
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

function stroke() {
  return { color: 'Green', brush: 'marker', points: [{ x: 512, y: 384 }] };
}

function picture() {
  return addStroke(changePage(createHistory(), 'flower'), stroke());
}

afterEach(() => vi.unstubAllGlobals());

describe('native coloring-page composition', () => {
  it('changes the page and paint together as one reversible picture operation', () => {
    const original = picture();
    const next = changePage(original, 'turtle');
    expect(next.drawing).toEqual({ version: 2, pageId: 'turtle', strokes: [] });
    expect(next.undo.at(-1)).toBe(original.drawing);
    expect(undoDrawing(next).drawing).toBe(original.drawing);
    expect(original.drawing.strokes).toEqual([stroke()]);
  });

  it('keeps the page through new ink and undoable clear', () => {
    const original = picture();
    const cleared = clearDrawing(original);
    expect(original.drawing.pageId).toBe('flower');
    expect(cleared.drawing).toEqual({ version: 2, pageId: 'flower', strokes: [] });
    expect(undoDrawing(cleared).drawing).toBe(original.drawing);
    expect(clearDrawing(cleared)).toBe(cleared);
  });

  it('leaves the painted picture and history intact when its page is selected again', () => {
    const original = picture();
    expect(changePage(original, 'flower')).toBe(original);
  });

  it('returns to blank paper without discarding the undoable painted page', () => {
    const original = picture();
    const blank = changePage(original, 'blank');
    expect(blank.drawing).toEqual({ version: 2, pageId: 'blank', strokes: [] });
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
        'not a supported drawing'
      );
    }
  );

  it('opens the first native slice’s saved pictures as blank paper', () => {
    expect(parseDrawing({ version: 1, strokes: [stroke()] })).toEqual({
      version: 2,
      pageId: 'blank',
      strokes: [stroke()],
    });
  });

  it('holds the selected page and ink at the export cut while a later page changes', async () => {
    const original = picture();
    const captures = createPngCapture();
    const request = captures.begin(original.drawing);
    const next = changePage(original, 'sunshine');
    expect(request.drawing).toEqual({ version: 2, pageId: 'flower', strokes: [stroke()] });
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
      JSON.stringify({ version: 1, strokes: [stroke()] })
    );
    await expect(reopenPicture('picture-1-first')).resolves.toEqual({
      version: 2,
      pageId: 'blank',
      strokes: [stroke()],
    });
    const original = picture().drawing;
    const saved = await savePicture(original);
    const opened = await reopenPicture(saved.id);
    expect(opened).toEqual(original);
    values.set(`splotch-picture:${saved.id}`, JSON.stringify({ ...original, pageId: 'unknown' }));
    await expect(reopenPicture(saved.id)).rejects.toThrow('not a supported drawing');
  });
});
