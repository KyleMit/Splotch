import { afterEach, expect, it, vi } from 'vitest';
import {
  capturePaperLayout,
  restorePaperLayout,
  createPaperLayoutMemory,
  recordPaper,
} from './paperLayout';
import { IDENTITY_PAPER_VIEW } from './paperView';

const rect = { left: 84, top: 75, width: 300, height: 400 };
const view = { scale: 0.5, rotate: 0, tx: 10, ty: 20 } as const;
afterEach(() => vi.restoreAllMocks());

it('omits identity presentations from ordinary undo metadata', () => {
  const paper = { cssW: rect.width, cssH: rect.height, pxW: rect.width, pxH: rect.height };
  expect(recordPaper(paper, 0, IDENTITY_PAPER_VIEW, rect, 0).presentation).toBeUndefined();
  expect(
    recordPaper(paper, 0, IDENTITY_PAPER_VIEW, { ...rect, width: rect.width + 1 }, 0).presentation
  ).toBeDefined();
});

it('snapshots geometry independently of the mutable engine state', () => {
  const snapshot = capturePaperLayout(view, rect, 0)!;
  expect(snapshot.view).toEqual(view);
  expect(snapshot.view).not.toBe(view);
  expect(snapshot.rect).not.toBe(rect);
  expect(capturePaperLayout(view, new DOMRect(84, 75, 300, 400), 0)?.rect).toEqual(rect);
});

it('restores the saved screen position relative to the current canvas origin', () => {
  const snapshot = capturePaperLayout(view, rect, 0);
  expect(restorePaperLayout(snapshot, { ...rect, left: 0, top: 0 }, 2, 0)).toEqual({
    ...view,
    tx: 178,
    ty: 170,
  });
});

it('defers to resize policy after a real viewport resize or rotation', () => {
  const snapshot = capturePaperLayout(view, rect, 0);
  expect(restorePaperLayout(snapshot, rect, 1, 90)).toBeUndefined();
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(window.innerWidth + 100);
  expect(restorePaperLayout(snapshot, rect, 1, 0)).toBeUndefined();
});

it('accepts history entries without a saved presentation', () => {
  expect(restorePaperLayout(undefined, rect, 1, 0)).toBeUndefined();
});

it('retains presentation across repeated chrome-sized viewport changes', () => {
  const preserve = createPaperLayoutMemory();
  expect(preserve(view, rect, 1, 0, false)).toEqual(view);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(window.innerWidth + 1);
  expect(preserve(undefined, rect, 1, 0, false)).toEqual(view);
  expect(preserve(undefined, rect, 1, 0, false)).toEqual(view);
  preserve(IDENTITY_PAPER_VIEW, rect, 1, 0, false);
  expect(preserve(undefined, rect, 1, 0, false)).toEqual(IDENTITY_PAPER_VIEW);
});

it('releases retained presentation after blanking or a real rotation', () => {
  const preserve = createPaperLayoutMemory();
  preserve(view, rect, 1, 0, false);
  expect(preserve(undefined, rect, 1, 0, true)).toBeUndefined();
  expect(preserve(undefined, rect, 1, 0, false)).toBeUndefined();
  preserve(view, rect, 1, 0, false);
  expect(preserve(undefined, rect, 1, 90, false)).toBeUndefined();
  expect(preserve(undefined, rect, 1, 0, false)).toBeUndefined();
});
