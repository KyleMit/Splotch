import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, host, mount, openSettingsSection } from './rsd-native-selection-host.mjs';
import { RsdColoringSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringSection.tsx';
import { LibraryProvider } from '../../../experiments/native-architecture/src/offlineLibrary/LibraryScope.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { catalogPack } from '../../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { OFFLINE_BOOKS } from '../../../experiments/native-architecture/src/offlineLibrary/books.generated.ts';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import {
  addStrokes,
  changePage,
  createHistory,
  emptyDrawing,
  strokeStyle,
} from '../../../experiments/native-architecture/src/drawing/model.ts';
import { offlinePageId } from '../../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';

// Settings › Coloring, where the downloaded books are managed; the picker carries no such controls
// (rsd-native-coloring-picker.test.mjs).
const dinosaurs = catalogPack('dinosaur', 'full');
const owner = createOfflineLibrary({ uri: (path) => `file:///private/library/${path}` }, 'full');

function inventory(installed, change = {}) {
  return { ...owner.snapshot(), status: 'ready', installed, inventoried: true, ...change };
}

// A control by its accessible name, or a text button by its label.
const control = (label) =>
  host.querySelector(`[aria-label="${label}"]`) ??
  [...host.querySelectorAll('button')].find((node) => node.textContent === label) ??
  null;
async function press(label) {
  const node = control(label);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}

function section({ state, enabled = true, remove, onColoringBookChange = vi.fn() }) {
  return createElement(
    LibraryProvider,
    { owner, state, remove: remove ?? vi.fn(async () => {}) },
    createElement(
      DrawingAppearanceProvider,
      { preference: 'system' },
      createElement(RsdColoringSection, { enabled, busy: false, onColoringBookChange })
    )
  );
}
const switchState = (label) => control(label).dataset.checked;
const megabytes = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;

describe('Settings › Coloring', () => {
  it('reports the downloaded books beside the Coloring book and mobile data switches', async () => {
    await mount(section({ state: inventory([dinosaurs]) }));
    expect(switchState('Coloring book')).toBe('true');
    expect(switchState('Download over mobile data')).toBe('false');
    expect(host.textContent).toContain('Downloaded pictures');
    expect(host.textContent).toContain(
      `1 of ${OFFLINE_BOOKS.length} extra books · ${megabytes(dinosaurs.bytes)}`
    );
    expect(control('Remove downloaded pictures').disabled).toBe(false);
  });

  it('starts downloads again on a mobile data change, as shipping’s policy event does', async () => {
    const setPolicy = vi.spyOn(owner, 'setPolicy').mockResolvedValue();
    try {
      await mount(section({ state: inventory([], { enabled: false }) }));
      await press('Download over mobile data');
      expect(setPolicy).toHaveBeenLastCalledWith(true, true);
    } finally {
      setPolicy.mockRestore();
    }
  });

  // Negative control: reapplying only after a removal leaves a failed or waiting library stalled.
  it.each([
    ['a removal paused', { enabled: false, allowMetered: true }],
    ['a failure stalled', { status: 'failed', fault: 'unavailable', allowMetered: true }],
    ['a network wait stalled', { status: 'waiting', fault: 'metered', allowMetered: true }],
  ])('reapplies the download policy %s when Coloring book turns back on', async (_name, change) => {
    const setPolicy = vi.spyOn(owner, 'setPolicy').mockResolvedValue();
    const onColoringBookChange = vi.fn();
    try {
      await mount(section({ state: inventory([], change), enabled: false, onColoringBookChange }));
      expect(control('Download over mobile data').disabled).toBe(true);
      await press('Coloring book');
      expect(onColoringBookChange).toHaveBeenCalledExactlyOnceWith(true);
      expect(setPolicy).toHaveBeenCalledExactlyOnceWith(true, true);
    } finally {
      setPolicy.mockRestore();
    }
  });

  it('turns Coloring book off without touching the download policy', async () => {
    const setPolicy = vi.spyOn(owner, 'setPolicy').mockResolvedValue();
    const onColoringBookChange = vi.fn();
    try {
      await mount(section({ state: inventory([dinosaurs]), onColoringBookChange }));
      await press('Coloring book');
      expect(onColoringBookChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(setPolicy).not.toHaveBeenCalled();
    } finally {
      setPolicy.mockRestore();
    }
  });

  it('removes the downloaded pictures, and says so when that fails', async () => {
    let finish;
    const remove = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const snapshot = vi.spyOn(owner, 'snapshot');
    try {
      await mount(section({ state: inventory([dinosaurs]), remove }));
      await press('Remove downloaded pictures');
      expect(remove).toHaveBeenCalledOnce();
      expect(control('Removing…').disabled).toBe(true);
      snapshot.mockReturnValue(inventory([dinosaurs], { status: 'failed', fault: 'unavailable' }));
      await act(async () => finish());
      expect(host.textContent).toContain('Downloaded pictures could not be removed. Try again.');
    } finally {
      snapshot.mockRestore();
    }
  });

  it.each([
    ['nothing downloaded', inventory([]), true, `0 of ${OFFLINE_BOOKS.length} extra books`],
    [
      'a download running',
      inventory([dinosaurs], { status: 'downloading', activeBook: 'space' }),
      true,
      'Downloading Space in the background',
    ],
    [
      'every book downloaded',
      inventory(OFFLINE_BOOKS.map((book) => catalogPack(book.id, 'full'))),
      true,
      'Every coloring book is ready offline',
    ],
    [
      'coloring off before any inventory',
      { ...owner.snapshot(), status: 'loading' },
      false,
      'Storage details are unavailable while coloring books are off',
    ],
  ])('reports %s', async (_name, state, enabled, line) => {
    await mount(section({ state, enabled }));
    expect(host.textContent).toContain(line);
  });
});

describe('removing books through the real drawing screen', () => {
  it.each([
    ['pen', 'offline'],
    ['magic', 'offline'],
    ['pen', 'farm'],
    ['magic', 'farm'],
  ])(
    'clears the removed overlay while retaining %s ink and exact Undo history on %s',
    async (brush, book) => {
      caller.realScreen = true;
      const library = caller.library.owner;
      const snapshot = vi.spyOn(library, 'snapshot').mockReturnValue(inventory([dinosaurs]));
      const initialize = vi.spyOn(library, 'initialize').mockResolvedValue();
      const openPage = vi.spyOn(library, 'openPage').mockResolvedValue();
      const remove = vi.spyOn(library, 'remove').mockImplementation(async () => {
        snapshot.mockReturnValue(inventory([]));
      });
      let historyOwner;
      function HistoryProbe() {
        historyOwner = useDrawingHistory();
        return null;
      }
      try {
        await mount(
          createElement(
            DrawingSessionProvider,
            null,
            createElement(HistoryProbe),
            createElement(RsdDrawingScreen)
          )
        );
        const first = createHistory(
          emptyDrawing(3, book === 'farm' ? 'farm/cat' : offlinePageId(dinosaurs, 'trex'))
        );
        const inked = addStrokes(
          first,
          [
            {
              ...strokeStyle(brush, 'Purple', first.drawing),
              points: [
                { x: 20, y: 20 },
                { x: 100, y: 100 },
              ],
            },
          ],
          canonicalPaper()
        );
        const selectedPage = changePage(
          inked,
          book === 'farm' ? 'farm/cow' : offlinePageId(dinosaurs, 'stegosaurus')
        );
        const selected = addStrokes(
          selectedPage,
          [
            {
              ...strokeStyle(brush, 'Purple', selectedPage.drawing),
              points: [
                { x: 30, y: 90 },
                { x: 110, y: 10 },
              ],
            },
          ],
          canonicalPaper()
        );
        await act(async () => historyOwner.setHistory(selected));
        await press('Settings');
        await openSettingsSection('Coloring');
        await press('Remove downloaded pictures');
        expect(remove).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledWith();
        expect(historyOwner.history.drawing.pageId).toBe('blank');
        expect(historyOwner.history.drawing.strokes).toBe(selected.drawing.strokes);
        expect(historyOwner.history.undo).toBe(selected.undo);
        await press('Close');
        expect(caller.paper.pageId).toBe('blank');
        expect(caller.paper.strokes).toBe(selected.drawing.strokes);
      } finally {
        remove.mockRestore();
        openPage.mockRestore();
        initialize.mockRestore();
        snapshot.mockRestore();
      }
    }
  );
});
