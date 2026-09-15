import { afterEach, expect, it, vi } from 'vitest';
import { capturePaperLayout, restorePaperLayout } from './paperLayout';
import { IDENTITY_PAPER_VIEW } from './paperView';

const rect = { left: 84, top: 75, width: 300, height: 400 };
const view = { scale: 0.5, rotate: 0, tx: 10, ty: 20 } as const;
afterEach(() => vi.restoreAllMocks());

it('omits identity presentations from ordinary undo metadata', () => {
  expect(capturePaperLayout(IDENTITY_PAPER_VIEW, rect, 0)).toBeUndefined();
});

it('snapshots geometry independently of the mutable engine state', () => {
  const snapshot = capturePaperLayout(view, rect, 0)!;
  expect(snapshot.view).toEqual(view);
  expect(snapshot.view).not.toBe(view);
  expect(snapshot.rect).not.toBe(rect);
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
