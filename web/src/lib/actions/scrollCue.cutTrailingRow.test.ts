import { afterEach, expect, it, vi } from 'vitest';
import { cutTrailingRow } from './scrollCue';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

// The phone picker from scrollCue.test.ts laid out for real: a header block
// above a two-column grid of four 150px rows with an 8px gap.
const GRID_TOP = 88;
const ROW_HEIGHT = 150;
const ROW_GAP = 8;
const ROW_COUNT = 4;
const CONTENT_HEIGHT = 744;

function setup() {
  let resizeGrid: (() => void) | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeGrid = callback;
      }
      observe() {}
      disconnect() {}
    }
  );

  // The dialog's height with no inline budget applied: the stylesheet's vh
  // ceiling, which is what a viewport resize changes.
  let naturalHeight = 690;
  const dialog = document.body.appendChild(document.createElement('dialog'));
  const grid = dialog.appendChild(document.createElement('div'));
  grid.style.rowGap = `${ROW_GAP}px`;
  for (let i = 0; i < ROW_COUNT * 2; i++) {
    const tile = grid.appendChild(document.createElement('div'));
    Object.defineProperty(tile, 'offsetHeight', { get: () => ROW_HEIGHT });
  }
  Object.defineProperties(grid, {
    offsetTop: { get: () => GRID_TOP },
    offsetParent: { get: () => dialog },
    offsetHeight: { get: () => ROW_COUNT * ROW_HEIGHT + (ROW_COUNT - 1) * ROW_GAP },
  });
  Object.defineProperties(dialog, {
    clientHeight: { get: () => naturalHeight },
    scrollHeight: { get: () => CONTENT_HEIGHT },
  });
  dialog.setAttribute('open', '');

  return {
    dialog,
    handle: cutTrailingRow(grid),
    resizeGrid: () => resizeGrid?.(),
    resizeViewport(height: number) {
      naturalHeight = height;
      window.dispatchEvent(new Event('resize'));
    },
  };
}

it('budgets the open dialog so its fold cuts the trailing row', () => {
  const { dialog, resizeGrid } = setup();
  resizeGrid();
  expect(dialog.style.maxHeight).toBe(
    `${GRID_TOP + 3 * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2}px`
  );
});

it('re-budgets when only the viewport height changes, which resizes no observed box', () => {
  const { dialog, resizeGrid, resizeViewport } = setup();
  resizeGrid();
  resizeViewport(540);
  expect(dialog.style.maxHeight).toBe(
    `${GRID_TOP + 2 * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2}px`
  );
});

it('stops following the viewport once destroyed', () => {
  const { dialog, handle, resizeGrid, resizeViewport } = setup();
  resizeGrid();
  handle?.destroy();
  resizeViewport(540);
  expect(dialog.style.maxHeight).toBe('');
});
