import { legacyDrawing, canonicalPaper, adoptedDrawing } from './native-paper-fixtures.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addStroke,
  changePage,
  clearDrawing,
  createHistory,
  emptyDrawing,
  strokeStyle,
  undoDrawing,
} from '../../src/drawing/model.ts';
import { parseDrawing } from '../../src/drawing/drawingFormat.ts';
import { COLORING_PAGES, PAGE_IDS } from '../../src/drawing/pages.ts';
import { createPngCapture } from '../../src/drawing/interactions.ts';

function legacyStroke() {
  return { color: 'Green', brush: 'marker', points: [{ x: 512, y: 384 }] };
}

function stroke() {
  return { ...strokeStyle('pen', 'Green', emptyDrawing()), points: legacyStroke().points };
}

function picture() {
  return addStroke(changePage(createHistory(), 'flower'), stroke(), canonicalPaper());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native coloring-page composition', () => {
  it('picks a page on blank paper without adding an Undo step', () => {
    const next = changePage(createHistory(), 'flower');
    expect(next.drawing.pageId).toBe('flower');
    expect(next.undo).toEqual([]);
    expect(undoDrawing(next)).toBe(next);
  });

  it('keeps a pen-only page pick when Undo removes the last stroke', () => {
    const original = picture();
    const next = changePage(original, 'turtle');
    expect(next.drawing.strokes).toBe(original.drawing.strokes);
    expect(next.undo).toBe(original.undo);
    expect(undoDrawing(next).drawing).toEqual(emptyDrawing(0, 'turtle'));
  });

  it('keeps ordinary page choices through Undo Clear while retaining Magic page Undo', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.24);
    const original = createHistory({
      ...legacyDrawing(3, 'flower'),
      strokes: [{ brush: 'magic', width: 30, rainbow: 3, points: [{ x: 512, y: 384 }] }],
    });
    const magicPage = changePage(original, 'turtle');
    const cleared = clearDrawing(magicPage, false);
    const picked = changePage(cleared, 'sunshine');
    expect(picked.undo).toBe(cleared.undo);
    const restored = undoDrawing(picked);
    expect(restored.drawing.strokes).toBe(original.drawing.strokes);
    expect(restored.drawing.pageId).toBe('sunshine');
    expect(undoDrawing(restored).drawing).toEqual({ ...original.drawing, rainbow: 2 });
  });

  it('retains mixed brush metadata and one page Undo unit through page removal and later ink', () => {
    const strokes = [
      { brush: 'magic', width: 30, rainbow: 3, points: [{ x: 512, y: 384 }] },
      { brush: 'crayon', width: 34, color: 'Blue', seed: 20, points: [{ x: 300, y: 384 }] },
      { brush: 'eraser', width: 44, points: [{ x: 400, y: 384 }] },
      stroke(),
    ];
    const original = createHistory({ ...legacyDrawing(3, 'flower'), strokes });
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
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.71).mockReturnValueOnce(0.24);
    const original = picture();
    const cleared = clearDrawing(original, false);
    expect(original.drawing.pageId).toBe('flower');
    expect(cleared.drawing).toEqual(emptyDrawing(7, 'flower'));
    expect(undoDrawing(cleared).drawing).toEqual({ ...original.drawing, rainbow: 7 });
    const visuallyEmpty = clearDrawing(cleared, true);
    expect(visuallyEmpty.drawing).toEqual(emptyDrawing(2, 'flower'));
    expect(visuallyEmpty.undo).toBe(cleared.undo);
  });

  it('leaves the painted picture and history intact when its page is selected again', () => {
    const original = picture();
    expect(changePage(original, 'flower')).toBe(original);
  });

  it('removes a pen-only page without adding an Undo step', () => {
    const original = picture();
    const blank = changePage(original, 'blank');
    expect(blank.drawing).toEqual({ ...original.drawing, pageId: 'blank' });
    expect(blank.drawing.strokes).toBe(original.drawing.strokes);
    expect(blank.undo).toBe(original.undo);
    expect(undoDrawing(blank).drawing).toEqual(emptyDrawing(0, 'blank'));
  });

  it.each(PAGE_IDS)(
    'round-trips the %s composition through the supported saved format',
    (pageId) => {
      const drawing = addStroke(
        changePage(createHistory(), pageId),
        stroke(),
        canonicalPaper()
      ).drawing;
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
    expect(() =>
      parseDrawing({ ...drawing, strokes: [{ ...legacyStroke(), brush: 'pen' }] })
    ).toThrow('This saved picture contains an invalid stroke width.');
  });

  it('opens the first native slice’s saved pictures as blank paper', () => {
    expect(parseDrawing({ version: 1, strokes: [legacyStroke()] })).toEqual({
      ...legacyDrawing(),
      strokes: [{ ...legacyStroke(), width: 22 }],
    });
  });

  it('holds the selected page and ink at the export cut while a later page changes', async () => {
    const original = picture();
    const captures = createPngCapture();
    const request = captures.begin(original.drawing, () => true);
    const next = changePage(original, 'sunshine');
    expect(request.drawing).toBe(original.drawing);
    expect(request.drawing).toEqual({
      ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 0, 'flower'),
      strokes: [stroke()],
    });
    expect(next.drawing.pageId).toBe('sunshine');
    expect(request.complete('snapshot PNG', { width: 1024, height: 768 })).toBe(true);
    await expect(request.promise).resolves.toMatchObject({
      base64: 'snapshot PNG',
      size: { width: 1024, height: 768 },
    });
  });
});
