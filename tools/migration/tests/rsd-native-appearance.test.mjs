import {
  caller,
  records,
  root,
  host,
  mount,
  checkedRadio,
  createPickerCaller,
  expandControls,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { act, createElement, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { themes } from '../../../web/src/lib/design/tokens.ts';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { HEX_DIM_KEYLINE } from '../../../experiments/native-architecture/src/rsdDrawing/hexPicker.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdColoringBookPicker } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { BUNDLED_FARM_SELECTORS } from '../../../experiments/native-architecture/src/drawing/bundledFarm/pickerImages.ts';
import { FARM_PAGE_IDS } from '../../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import {
  RELEASE_NOTES,
  WHATS_NEW_STAMP,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';

async function refresh() {
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}
// One option of a Settings segmented track, named by its group and its own label.
const radio = (group, label) =>
  host.querySelector(`[role="radiogroup"][aria-label="${group}"] [aria-label="${label}"]`);
async function chooseTheme(label) {
  const node = radio('Theme', label);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
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

function lastSurface() {
  return records.props.findLast((props) => props.testID === 'modal-surface');
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
  await openSettingsSection('Appearance');
  checkedRadio(radio('Theme', 'System'));
  // The drawing screen's frame wears the palette bar's surface in its safe-area strips.
  expect(lastFrame().style.backgroundColor).toBe('#ffffff');
  storage.write.mockRejectedValueOnce(new Error('disk full'));
  await chooseTheme('Dark');
  checkedRadio(radio('Theme', 'Dark'));
  expect(lastFrame().style.backgroundColor).toBe('#23232b');
  expect(
    [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
  ).toEqual(['light-content', 'light-content']);
  expect(
    records.props
      .filter((props) => props.accessibilityLabel === 'Appearance' && 'onRequestClose' in props)
      .at(-1)
  ).toMatchObject({ statusBarTranslucent: true, navigationBarTranslucent: true });
  expect(
    records.props.filter((props) => props.style?.backgroundColor === '#23232b').length
  ).toBeGreaterThanOrEqual(2);
  const themeTrack = records.props.findLast(
    (props) =>
      (props.role ?? props.accessibilityRole) === 'radiogroup' &&
      (props['aria-label'] ?? props.accessibilityLabel) === 'Theme'
  );
  expect(themeTrack.style.backgroundColor).toBe(themes.dark.controlTrack);
  expect(host.textContent).toContain('could not be saved');
  await click('Try saving settings again');
  expect(JSON.parse(stored)).toEqual({
    version: 12,
    orientation: 'portrait',
    saveOnDeleteEnabled: false,
    buttonScale: 100,
    reduceMotion: 'system',
    whatsNewSeen: null,
    pencilEraserEnabled: true,
    applePencilSeen: false,
    toolbarStyle: 'buttons',
    coloringBookEnabled: true,
    soundVolume: 50,
    drawingSoundEnabled: true,
    deleteSoundEnabled: true,
    undoButtonEnabled: true,
    strokeWidthControlEnabled: true,
    soundEnabled: false,
    strokeWidth: 'thin',
    eraserWidth: 'thick',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'dark',
    aiEnabled: false,
    parentPolicies: {
      ai: 'always',
      imageReport: 'always',
      feedback: 'always',
      parentCenter: 'always',
    },
  });
  expect(host.textContent).not.toContain('could not be saved');
  await chooseTheme('Light');
  records.scheme = 'dark';
  await refresh();
  checkedRadio(radio('Theme', 'Light'));
  expect(lastFrame().style.backgroundColor).toBe('#ffffff');
  expect(
    [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
  ).toEqual(['dark-content', 'dark-content']);
  await chooseTheme('System');
  checkedRadio(radio('Theme', 'System'));
  expect(lastFrame().style.backgroundColor).toBe('#23232b');
  records.scheme = 'light';
  await refresh();
  expect(lastFrame().style.backgroundColor).toBe('#ffffff');
  expect(JSON.parse(stored).appearance).toBe('system');
});

it('selects page artwork from the same explicit preference as the native modal', async () => {
  function picker(preference) {
    return createElement(
      DrawingAppearanceProvider,
      { preference },
      createElement(RsdColoringBookPicker, {
        selected: 'blank',
        orientation: 'portrait',
        visible: true,
        onDismiss() {},
        onChoose() {},
        onClose() {},
      })
    );
  }
  const art = BUNDLED_FARM_SELECTORS[FARM_PAGE_IDS[0]].portrait;
  records.scheme = 'light';
  await mount(picker('dark'));
  expect(lastSurface().style.backgroundColor).toBe('#23232b');
  expect(records.props.some((props) => props.source?.uri === art.dark)).toBe(true);
  await act(async () => root.render(picker('light')));
  expect(records.props.findLast((props) => props.source?.uri === art.light)).toBeDefined();
  expect(lastSurface().style.backgroundColor).toBe('#ffffff');
});

it.each(['light', 'dark'])(
  'themes the Color Picker card and swatch keylines through the RSD caller in %s',
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
    const other = appearance === 'dark' ? 'light' : 'dark';
    const keyline = (hex) =>
      host
        .querySelector('[aria-label="Color Picker"]')
        .querySelector(`[aria-label="${hex}"] polygon`)
        .getAttribute('fill');
    const card = () =>
      records.props.findLast((props) => props.testID === 'color-picker-card').style;
    try {
      await mount(createElement(Screen));
      const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
      await click('More colors');
      expect(
        records.props.findLast((props) => props.accessibilityLabel === 'Color Picker')
      ).toMatchObject({
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        transparent: true,
      });
      expect(card().backgroundColor).toBe(DRAWING_THEMES[appearance].surface);
      expect(keyline('#FFFFFF')).toBe(DRAWING_THEMES[appearance].iconInk);
      expect(keyline('#1A1F24')).toBe(HEX_DIM_KEYLINE);
      await act(async () => owner.setAppearance(other));
      expect(card().backgroundColor).toBe(DRAWING_THEMES[other].surface);
      expect(keyline('#FFFFFF')).toBe(DRAWING_THEMES[other].iconInk);
      expect(setColor).not.toHaveBeenCalled();
      expect(caller.sound.settings.selectedColor).toBe('Black');
      await click('#FFFFFF');
      expect(setColor).toHaveBeenCalledExactlyOnceWith('#FFFFFF');
      expect(caller.sound.settings.selectedColor).toBe('#FFFFFF');
      expect(caller.sound.settings.customColors).toEqual(['#FFFFFF']);
    } finally {
      owner.dispose();
    }
  }
);

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
function volumeSlider() {
  const props = records.props.findLast((entry) => entry.role === 'slider');
  expect(props?.['aria-label']).toBe('Volume');
  return props;
}
async function toggleSound() {
  const node = host.querySelector('[role="switch"][aria-label="Sound"]');
  expect(node).not.toBeNull();
  await act(async () => node.click());
}
async function adjustVolume(actionName) {
  await act(async () => volumeSlider().onAccessibilityAction({ nativeEvent: { actionName } }));
}
it('writes the real Volume slider once it settles, independently of the Sound switch, retries, and retains ink', async () => {
  const storage = rootColoringSettings();
  await mount(createElement(RsdDrawingScreen));
  await click('Draw RSD fixture stroke');
  const drawing = coloringPaper();
  await click('Settings');
  await openSettingsSection('Sound');
  expect(host.querySelector('[role="slider"]')).toBeNull();
  await toggleSound();
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({ soundEnabled: true });
  expect(volumeSlider()['aria-valuenow']).toBe(50);
  storage.write.mockRejectedValueOnce(new Error('disk full'));
  await adjustVolume('increment');
  const raised = volumeSlider()['aria-valuenow'];
  expect(raised).toBeGreaterThan(50);
  expect(host.textContent).toContain('could not be saved');
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    soundEnabled: true,
    soundVolume: raised,
  });
  await click('Try saving settings again');
  expect(storage.write.mock.calls.at(-1)).toEqual(storage.write.mock.calls.at(-2));
  expect(host.textContent).not.toContain('could not be saved');
  await toggleSound();
  expect(host.querySelector('[role="slider"]')).toBeNull();
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    soundEnabled: false,
    soundVolume: raised,
  });
  await click('Close');
  expect(coloringPaper()).toEqual(drawing);
  expect(caller.aiSend).not.toHaveBeenCalled();
  expect(caller.feedbackSend).not.toHaveBeenCalled();
});
it('reads bundled help, privacy and beta notes through Settings without changing ink or sending requests', async () => {
  const storage = rootColoringSettings();
  await mount(createElement(RsdDrawingScreen));
  await expandControls();
  await click('Draw RSD fixture stroke');
  const drawing = coloringPaper();
  expect(drawing.strokes).toHaveLength(1);
  await click('Settings');
  await openSettingsSection('About');
  await click('Help and about');
  expect(host.textContent).toContain('Make a picture');
  expect(host.textContent).toContain('Splotch 1.6.0 · Beta');
  await click('Privacy');
  expect(host.textContent).toContain('Drawing stays on your device');
  expect(host.textContent).toContain('AI pictures are optional');
  expect(host.textContent).toContain(
    'We review reports within 24 hours and schedule deletion after 30 days by a daily cleanup.'
  );
  await click('Back to help and about');
  await click('What’s new');
  expect(host.querySelector('[data-native-modal="Updates"]')).not.toBeNull();
  expect(host.textContent).toContain(RELEASE_NOTES[0].sections[0].blocks[0].text);
  expect(host.textContent).not.toContain('In this beta');
  await click('Back');
  expect(host.querySelector('[role="list"] button[aria-label^="Appearance, "]')).not.toBeNull();
  await openSettingsSection('About');
  await click('Help and about');
  await click('Close');
  expect(coloringPaper()).toEqual(drawing);
  await click('Undo');
  expect(coloringPaper().strokes).toHaveLength(0);
  expect(storage.write).toHaveBeenCalledOnce();
  expect(JSON.parse(storage.write.mock.calls[0][0])).toMatchObject({
    whatsNewSeen: WHATS_NEW_STAMP,
    pencilEraserEnabled: true,
    applePencilSeen: false,
  });
  expect(caller.aiSend).not.toHaveBeenCalled();
  expect(caller.feedbackSend).not.toHaveBeenCalled();
  expect(caller.aiVaultRead).not.toHaveBeenCalled();
});
it('hides Coloring through actual RSD Settings and clamps actual history Undo while retaining ink', async () => {
  const storage = rootColoringSettings();
  await mount(createElement(RsdDrawingScreen));
  await expandControls();
  await click('Coloring books');
  await click('Cat coloring page');
  await click('Draw RSD fixture stroke');
  const original = coloringPaper();
  expect(original.pageId).toBe('farm/cat');
  expect(original.strokes).toHaveLength(1);
  await click('Settings');
  await openSettingsSection('Coloring');
  await click('Coloring book');
  expect(host.textContent).not.toContain('Grown-ups only');
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    version: 12,
    coloringBookEnabled: false,
    aiEnabled: false,
  });
  expect(coloringPaper()).toEqual({ ...original, pageId: 'blank' });
  await click('Close');
  await click('Undo');
  expect(coloringPaper().pageId).toBe('blank');
  expect(host.querySelector('[aria-label="Coloring books"]')).toBeNull();
  expect(original.pageId).toBe('farm/cat');
  await click('Settings');
  await openSettingsSection('Coloring');
  await click('Coloring book');
  await click('Close');
  await click('Coloring books');
  expect(host.querySelector('[aria-label="Cat coloring page"]')).not.toBeNull();
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
  await expandControls();
  await click('Coloring books');
  await started;
  expect(platform.download).toHaveBeenCalledOnce();
  await click('Close');
  await click('Settings');
  await openSettingsSection('Coloring');
  await click('Coloring book');
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
