import { caller, records, root, host, mount, checkedRadio } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdColoringBookPicker } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
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
  const owner = createSoundSettings(storage, (settings) => {
    caller.sound.settings = settings;
    root.render(createElement(RsdDrawingScreen));
  });
  caller.sound.owner = { settings: owner };
  await mount(createElement(RsdDrawingScreen));
  expect(host.textContent).toContain('Loading drawing settings');
  expect(lastFrame().style.backgroundColor).toBe('#1a1922');
  expect(host.querySelector('[data-status-bar]').dataset.statusBar).toBe('light-content');
  records.scheme = 'light';
  expect(host.querySelector('button')).toBeNull();
  const loading = owner.load();
  await act(async () => {
    resolveRead(stored);
    await loading;
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
    version: 4,
    soundEnabled: false,
    strokeWidth: 'thin',
    eraserWidth: 'thick',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'dark',
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
  owner.dispose();
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
