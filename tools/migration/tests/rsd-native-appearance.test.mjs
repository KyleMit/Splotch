import {
  caller,
  records,
  root,
  host,
  mount,
  checkedRadio,
  createPickerCaller,
} from './rsd-native-selection-host.mjs';
import { act, createElement, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdColoringBookPicker } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  BUNDLED_BOOK_ART,
  BUNDLED_BOOK_COVERS,
} from '../../../experiments/native-architecture/src/drawing/bundledBookAssets.ts';
import { FARM_PAGE_IDS } from '../../../experiments/native-architecture/src/drawing/bundledBooks.ts';

async function refresh() {
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}
async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
function lastFrame() {
  return records.props.findLast((props) => props.testID === 'rsd-safe-area-frame');
}

it('hydrates before usable controls and persists appearance through the real RSD Settings caller, modal theme and retry', async () => {
  let stored = JSON.stringify({
    version: 3,
    soundEnabled: false,
    strokeWidth: 'thin',
    eraserWidth: 'thick',
    selectedColor: 'Purple',
    customColors: [],
  });
  let resolveRead;
  const storage = {
    read: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    write: vi.fn(async (snapshot) => {
      stored = snapshot;
    }),
  };
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'marker',
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
  };
  records.scheme = 'dark';
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
  caller.settingsStorage = storage;
  await mount(createElement(RsdDrawingScreen));
  expect(host.textContent).toContain('Loading drawing settings');
  expect(lastFrame().style.backgroundColor).toBe('#1a1922');
  expect(host.querySelector('[data-status-bar]').dataset.statusBar).toBe('light-content');
  records.scheme = 'light';
  expect(host.querySelector('button')).toBeNull();
  await act(async () => {
    resolveRead(stored);
  });
  checkedRadio(host.querySelector('[aria-label="System appearance"]'));
  expect(lastFrame().style.backgroundColor).toBe('#f1efeb');
  storage.write.mockRejectedValueOnce(new Error('disk full'));
  await click('Dark appearance');
  checkedRadio(host.querySelector('[aria-label="Dark appearance"]'));
  expect(lastFrame().style.backgroundColor).toBe('#1a1922');
  expect(
    [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
  ).toEqual(['light-content', 'light-content']);
  expect(
    records.props.filter((props) => props.accessibilityLabel === 'Drawing settings').at(-1)
  ).toMatchObject({ statusBarTranslucent: true, navigationBarTranslucent: true });
  expect(
    records.props.filter((props) => props.style?.backgroundColor === '#23232b').length
  ).toBeGreaterThanOrEqual(2);
  expect(host.querySelector('[aria-label="Light appearance"]').dataset.nativeBackground).toBe(
    '#211f29'
  );
  expect(host.textContent).toContain('could not be saved');
  await click('Try saving settings again');
  expect(JSON.parse(stored)).toEqual({
    version: 6,
    coloringBookEnabled: true,
    soundEnabled: false,
    strokeWidth: 'thin',
    eraserWidth: 'thick',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'dark',
    aiEnabled: false,
    parentPolicies: { ai: 'always', feedback: 'always', parentCenter: 'always' },
  });
  expect(host.textContent).not.toContain('could not be saved');
  await click('Light appearance');
  records.scheme = 'dark';
  await refresh();
  checkedRadio(host.querySelector('[aria-label="Light appearance"]'));
  expect(lastFrame().style.backgroundColor).toBe('#f1efeb');
  expect(
    [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
  ).toEqual(['dark-content', 'dark-content']);
  await click('System appearance');
  checkedRadio(host.querySelector('[aria-label="System appearance"]'));
  expect(lastFrame().style.backgroundColor).toBe('#1a1922');
  records.scheme = 'light';
  await refresh();
  expect(lastFrame().style.backgroundColor).toBe('#f1efeb');
  expect(JSON.parse(stored).appearance).toBe('system');
});

it('selects Book cover and page artwork from the same explicit preference as the native modal', async () => {
  function picker(preference) {
    return createElement(
      DrawingAppearanceProvider,
      { preference },
      createElement(RsdColoringBookPicker, {
        selected: FARM_PAGE_IDS[0],
        onChoose() {},
        onClose() {},
      })
    );
  }
  records.scheme = 'light';
  await mount(picker('dark'));
  expect(records.props.findLast((props) => props.source)?.source.uri).toBe(
    BUNDLED_BOOK_COVERS.dark
  );
  expect(lastFrame().style.backgroundColor).toBe('#1a1922');
  await click('Farm coloring book');
  const images = records.props.filter((props) => props.source?.uri);
  expect(
    images.some((props) => props.source.uri === BUNDLED_BOOK_ART[FARM_PAGE_IDS[0]].dark.selector)
  ).toBe(true);
  await act(async () => root.render(picker('light')));
  expect(
    records.props.findLast(
      (props) => props.source?.uri === BUNDLED_BOOK_ART[FARM_PAGE_IDS[0]].light.selector
    )
  ).toBeDefined();
  expect(lastFrame().style.backgroundColor).toBe('#f1efeb');
});

it.each(['light', 'dark'])(
  'keeps semantic Black and transparent ColorPicker backing through the RSD caller in %s',
  async (appearance) => {
    let update = () => {};
    const { owner } = createPickerCaller(() => update());
    await owner.load();
    await owner.setColor('Black');
    await owner.setAppearance(appearance);
    caller.screen.disabled = false;
    function Screen() {
      const [, rerender] = useState(0);
      update = () => rerender((value) => value + 1);
      return createElement(RsdDrawingScreen);
    }
    try {
      await mount(createElement(Screen));
      const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
      await click('More colors');
      let picker = host.querySelector('[aria-label="Color picker"]');
      expect(picker.textContent).toContain(appearance === 'dark' ? '#FFFFFF' : '#0A0B10');
      const frame = records.props.findLast((props) => props.testID === 'rsd-safe-area-frame');
      expect(frame.style.backgroundColor).toBe('transparent');
      expect(frame.edges).toEqual(['top', 'right', 'bottom', 'left']);
      expect(
        records.props.findLast((props) => props.accessibilityLabel === 'Color picker')
      ).toMatchObject({
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        transparent: true,
      });
      await click('Use color');
      expect(setColor).toHaveBeenCalledExactlyOnceWith('Black');
      expect(caller.sound.settings.selectedColor).toBe('Black');
      expect(caller.sound.settings.customColors).toEqual([]);
      await click('More colors');
      await act(async () => owner.setAppearance(appearance === 'dark' ? 'light' : 'dark'));
      picker = host.querySelector('[aria-label="Color picker"]');
      expect(picker.textContent).toContain(appearance === 'dark' ? '#0A0B10' : '#FFFFFF');
      const tile = picker.querySelector('[aria-label^="Explore "]');
      const literal = tile.getAttribute('aria-label').slice('Explore '.length);
      await act(async () => tile.click());
      await click('Use color');
      expect(caller.sound.settings.selectedColor).toBe(literal);
      expect(caller.sound.settings.customColors).toEqual([literal]);
    } finally {
      owner.dispose();
    }
  }
);

async function coloringMenu(label) {
  const tools = [...host.querySelectorAll('[aria-label]')].find((node) =>
    node.getAttribute('aria-label').startsWith('Drawing tools.')
  );
  expect(tools).toBeDefined();
  await click(tools.getAttribute('aria-label'));
  await click(label);
}
function coloringPaper() {
  return JSON.parse(host.querySelector('[data-testid="rsd-real-history-paper"]').dataset.drawing);
}
function rootColoringSettings() {
  caller.realScreen = true;
  caller.settingsStorage = {
    read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
    write: vi.fn(async () => {}),
  };
  return caller.settingsStorage;
}
it('hides Coloring through actual RSD Settings and clamps actual history Undo and saved reopen while retaining ink', async () => {
  const storage = rootColoringSettings();
  await mount(createElement(RsdDrawingScreen));
  await coloringMenu('Coloring pages');
  await click('More pages');
  await click('Sunshine');
  await click('Draw RSD fixture stroke');
  const original = coloringPaper();
  expect(original.pageId).toBe('sunshine');
  expect(original.strokes).toHaveLength(1);
  await coloringMenu('Settings');
  await click('Coloring book on');
  expect(host.textContent).not.toContain('Grown-ups only');
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    version: 6,
    coloringBookEnabled: false,
    aiEnabled: false,
  });
  expect(coloringPaper()).toEqual({ ...original, pageId: 'blank' });
  await click('Keep drawing');
  await click('Undo');
  expect(coloringPaper().pageId).toBe('blank');
  const tools = [...host.querySelectorAll('[aria-label]')].find((node) =>
    node.getAttribute('aria-label').startsWith('Drawing tools.')
  );
  await click(tools.getAttribute('aria-label'));
  expect(host.querySelector('[aria-label="Coloring pages"]')).toBeNull();
  await click('Keep drawing');
  caller.drawingList.mockReturnValue([
    { id: 'picture-1-fixture', name: 'saved coloring', modifiedAt: 1 },
  ]);
  caller.drawingOpen.mockResolvedValue(original);
  await coloringMenu('Pictures');
  await click('Open picture from saved coloring');
  expect(caller.drawingOpen).toHaveBeenCalledExactlyOnceWith('picture-1-fixture');
  expect(coloringPaper()).toEqual({ ...original, pageId: 'blank' });
  expect(original.pageId).toBe('sunshine');
  await coloringMenu('Settings');
  await click('Coloring book off');
  await click('Keep drawing');
  await coloringMenu('Coloring pages');
  expect(host.querySelector('[aria-label="Farm coloring book"]')).not.toBeNull();
  expect(caller.aiSend).not.toHaveBeenCalled();
  expect(caller.aiVaultWrite).not.toHaveBeenCalled();
});
it('fences a real pending Offline transfer when the rendered RSD master is disabled without changing download policy', async () => {
  rootColoringSettings();
  let entered, finish, signal;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const platform = {
    environment: async () => ({ online: true, metered: false, freeBytes: 1e9 }),
    list: async () => [],
    read: async () => null,
    verify: async () => false,
    write: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    uri: (path) => path,
    download: vi.fn(async (_path, _file, current) => {
      signal = current;
      entered();
      await pending;
    }),
    dispose() {},
  };
  caller.library.owner.dispose();
  const owner = createOfflineLibrary(platform, 'full');
  caller.library = { owner, state: owner.snapshot(), remove: () => owner.remove(async () => []) };
  await mount(createElement(RsdDrawingScreen));
  await coloringMenu('Coloring pages');
  await started;
  expect(platform.download).toHaveBeenCalledOnce();
  await click('Keep drawing');
  await coloringMenu('Settings');
  await click('Coloring book on');
  expect(signal.aborted).toBe(true);
  expect(owner.snapshot()).toMatchObject({ enabled: true, allowMetered: false, installed: [] });
  await act(async () => {
    finish();
    await owner.settled();
  });
  expect(owner.snapshot().installed).toEqual([]);
  expect(platform.write).not.toHaveBeenCalled();
  expect(platform.move).not.toHaveBeenCalled();
  expect(coloringPaper().pageId).toBe('blank');
});
