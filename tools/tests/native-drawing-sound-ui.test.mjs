// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawingAppearance } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';
const sound = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  load: vi.fn(),
  current: 'active',
  scheme: 'light',
  listeners: new Set(),
  remove: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: { read: sound.read, write: sound.write },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: sound.load,
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => ({
  drawingDraftStorage: { read: async () => null, write: async () => {} },
  protectedDraftPageIds: async () => [],
}));
vi.mock('react-native', () => {
  const container = ({ children, style }) =>
    createElement(
      'div',
      { 'data-background': Object.assign({}, ...[style].flat().filter(Boolean)).backgroundColor },
      children
    );
  return {
    AccessibilityInfo: createAccessibilityInfoFixture(),
    AppState: {
      get currentState() {
        return sound.current;
      },
      addEventListener: (...args) => sound.subscribe(...args),
    },
    findNodeHandle: (owner) => owner,
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove() {} }),
    },
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    useColorScheme: () => sound.scheme,
    Platform: { OS: 'android' },
    ActivityIndicator: () => null,
    Modal: ({ visible, children, statusBarTranslucent, navigationBarTranslucent }) =>
      visible &&
      createElement(
        'div',
        {
          role: 'dialog',
          'data-status-translucent': statusBarTranslucent,
          'data-navigation-translucent': navigationBarTranslucent,
        },
        children
      ),
    Pressable: forwardRef(
      (
        { children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState },
        ref
      ) =>
        createElement(
          'button',
          {
            ref,
            onClick: onPress,
            disabled,
            'aria-label': accessibilityLabel,
            role: accessibilityRole,
            'aria-checked': accessibilityState?.checked,
          },
          children
        )
    ),
    Switch: ({ value, disabled, onValueChange, accessibilityLabel }) =>
      createElement('input', {
        type: 'checkbox',
        role: 'switch',
        checked: value,
        disabled,
        'aria-label': accessibilityLabel,
        onChange: (event) => onValueChange(event.target.checked),
      }),
    SafeAreaView: container,
    ScrollView: container,
    View: container,
    Text: ({ children, accessibilityRole, accessibilityLiveRegion }) =>
      createElement(
        'span',
        { role: accessibilityRole, 'aria-live': accessibilityLiveRegion },
        children
      ),
    StatusBar: ({ barStyle }) => createElement('span', { 'data-status-bar': barStyle }),
    StyleSheet: { create: (styles) => styles },
  };
});
vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('svg', null, children),
  Rect: () => null,
  Path: () => null,
}));
vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(({ sound }, ref) => {
    const contact = useRef(null);
    const appearance = useDrawingAppearance();
    useImperativeHandle(
      ref,
      () => ({
        lockInput: () => () => {},
        refreshGeometry() {},
      }),
      []
    );
    return createElement(
      'div',
      { 'data-paper-theme': appearance },
      createElement(
        'button',
        {
          onClick: () => {
            contact.current?.end();
            contact.current = sound?.begin({ x: 10, y: 20 }, 100) ?? null;
          },
        },
        'Start stroke'
      ),
      createElement(
        'button',
        { onClick: () => contact.current?.sample({ x: 60, y: 20 }, 200) },
        'Move stroke'
      ),
      createElement('button', { onClick: () => contact.current?.end() }, 'End stroke')
    );
  }),
}));
function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let ui;
let loop;
let latest;
function Probe() {
  latest = useDrawingSound();
  return createElement('span', null, latest.audioMessage);
}
async function mount(component = DrawingScreen) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let closed = false;
  ui = {
    container,
    async click(label) {
      const target = [...container.querySelectorAll('button,input')].find(
        (element) => element.getAttribute('aria-label') === label || element.textContent === label
      );
      expect(target, label).toBeDefined();
      expect(target.disabled, label).toBe(false);
      await act(async () => target.click());
    },
    async settings() {
      await this.click('Drawing tools');
      expect(this.dialog().textContent).toContain('Drawing tools');
      await this.click('Settings');
      expect(this.switch()).not.toBeNull();
    },
    async refresh() {
      await act(async () => root.render(createElement(component)));
    },
    close() {
      if (closed) return;
      closed = true;
      act(() => root.unmount());
      container.remove();
    },
    dialog: () => container.querySelector('[role="dialog"]'),
    switch: () => container.querySelector('[aria-label="Drawing sound"]'),
  };
  await act(async () => root.render(createElement(component)));
}
async function appState(state) {
  await act(async () => sound.listeners.forEach((listener) => listener(state)));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sound.current = 'active';
  sound.scheme = 'light';
  sound.listeners.clear();
  sound.remove.mockReset();
  sound.subscribe.mockReset().mockImplementation((_name, listener) => {
    sound.listeners.add(listener);
    return {
      remove() {
        sound.listeners.delete(listener);
        sound.remove();
      },
    };
  });
  sound.read.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  sound.write.mockReset().mockResolvedValue();
  loop = { start: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), dispose: vi.fn() };
  sound.load.mockReset().mockResolvedValue(loop);
  latest = null;
  ui = null;
});
afterEach(() => {
  ui?.close();
  vi.useRealTimers();
});
describe('live drawing sound owner and Settings screen', () => {
  it('persists the volume and scales the live loop by it after a remount', async () => {
    let stored = '{"version":1,"soundEnabled":true}';
    sound.read.mockImplementation(async () => stored);
    sound.write.mockImplementation(async (snapshot) => {
      stored = snapshot;
    });
    await mount(Probe);
    await act(async () => latest.owner.settings.setSoundVolume(25));
    expect(JSON.parse(stored)).toMatchObject({ soundEnabled: true, soundVolume: 25 });
    ui.close();
    await mount(Probe);
    const owner = latest.owner;
    expect(latest.settings).toMatchObject({ soundVolume: 25, saved: true });
    await act(async () => owner.audio.begin({ x: 10, y: 20 }, 100));
    await act(async () => owner.audio.sample({ x: 100, y: 20 }, 200));
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.1);
  });
  it('updates active sound through the legacy hook without replacing its audio owner', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount(Probe);
    const owner = latest.owner;
    await act(async () => owner.audio.begin({ x: 10, y: 20 }, 100));
    await act(async () => owner.audio.sample({ x: 100, y: 20 }, 200));
    await act(async () => owner.settings.setSoundVolume(25));
    expect(latest.owner).toBe(owner);
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.1);
    expect(sound.load).toHaveBeenCalledOnce();
    await act(async () => owner.settings.setSoundVolume(100));
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.4);
  });
  it('silences the drawing loop when Drawing stops making sound, and loads it again after', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount(Probe);
    const owner = latest.owner;
    await act(async () => owner.audio.begin({ x: 10, y: 20 }, 100));
    expect(sound.load).toHaveBeenCalledOnce();
    await act(async () => owner.settings.setDrawingSoundEnabled(false));
    expect(loop.dispose).toHaveBeenCalledOnce();
    await act(async () => owner.audio.begin({ x: 10, y: 20 }, 300));
    expect(sound.load).toHaveBeenCalledOnce();
    await act(async () => owner.settings.setDrawingSoundEnabled(true));
    await act(async () => owner.audio.begin({ x: 10, y: 20 }, 500));
    expect(sound.load).toHaveBeenCalledTimes(2);
  });
  it('persists real appearance controls, themes chrome immediately after failure, retries and restores on remount', async () => {
    let stored = '{"version":1,"soundEnabled":false}';
    sound.read.mockImplementation(async () => stored);
    sound.write.mockImplementation(async (snapshot) => {
      stored = snapshot;
    });
    await mount();
    await ui.settings();
    sound.write.mockRejectedValueOnce(new Error('disk full'));
    await ui.click('Dark appearance');
    expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe('dark');
    expect(
      [...ui.container.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
    ).toEqual(
      Array(ui.container.querySelectorAll('[data-status-bar]').length).fill('light-content')
    );
    expect(ui.container.querySelector('[data-background="#211f29"]')).not.toBeNull();
    expect(ui.dialog().textContent).toContain('could not be saved');
    expect(ui.dialog().dataset.statusTranslucent).toBe('true');
    expect(ui.dialog().dataset.navigationTranslucent).toBe('true');
    // The frame paints once, on its provider; the padded view inside it paints nothing.
    expect(ui.dialog().querySelectorAll('[data-background="transparent"]')).toHaveLength(1);
    expect(ui.dialog().querySelector('[data-background="#1a1922"]')).toBeNull();
    expect(JSON.parse(sound.write.mock.calls.at(-1)[0])).toMatchObject({
      appearance: 'dark',
      soundEnabled: false,
    });
    await ui.click('Retry saving');
    ui.close();
    await mount();
    expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe('dark');
    await ui.settings();
    await ui.click('Light appearance');
    sound.scheme = 'dark';
    await ui.refresh();
    expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe('light');
    expect(
      [...ui.container.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar)
    ).toEqual(['dark-content', 'dark-content']);
    await ui.click('System appearance');
    expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe('dark');
    sound.scheme = 'light';
    await ui.refresh();
    expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe('light');
    expect(JSON.parse(stored).appearance).toBe('system');
  });

  it.each(['Light', 'Dark'])(
    'keeps the actual Settings overlay transparent over the %s drawing',
    async (appearance) => {
      await mount();
      await ui.settings();
      await ui.click(`${appearance} appearance`);
      const theme = appearance.toLowerCase();
      {
        expect(ui.container.querySelector('[data-paper-theme]').dataset.paperTheme).toBe(theme);
        expect(ui.dialog().querySelectorAll('[data-background="transparent"]')).toHaveLength(1);
        expect(ui.dialog().querySelector('[data-background="#1a1922"]')).toBeNull();
        expect(ui.dialog().querySelector('[data-background="#f1efeb"]')).toBeNull();
        expect(ui.dialog().dataset.statusTranslucent).toBe('true');
        expect(ui.dialog().dataset.navigationTranslucent).toBe('true');
        expect(ui.dialog().querySelector('[data-status-bar]').dataset.statusBar).toBe(
          theme === 'dark' ? 'light-content' : 'dark-content'
        );
      }
    }
  );

  it('routes start, sample and end from the screen to the actual controller', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount();
    await ui.click('Start stroke');
    await ui.click('Move stroke');
    expect(sound.load).toHaveBeenCalledOnce();
    expect(loop.start).toHaveBeenCalledOnce();
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.2);
    await ui.click('End stroke');
    expect(loop.stop).toHaveBeenCalledOnce();
  });
  it('persists the real switch choice, retries a failed write and closes the sheet', async () => {
    await mount();
    await ui.settings();
    expect(ui.dialog()).not.toBeNull();
    expect(ui.switch().checked).toBe(false);
    sound.write.mockRejectedValueOnce(new Error('disk full'));
    await ui.click('Drawing sound');
    expect(ui.switch().checked).toBe(true);
    expect(ui.dialog().textContent).toContain('could not be saved');
    expect(sound.write).toHaveBeenLastCalledWith(
      '{"version":16,"soundEnabled":true,"strokeWidth":"medium","eraserWidth":"medium","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}'
    );
    await ui.click('Retry saving');
    expect(sound.write).toHaveBeenCalledTimes(2);
    expect(ui.dialog().textContent).not.toContain('could not be saved');
    await ui.click('Close Settings');
    expect(ui.dialog()).toBeNull();
    await ui.click('Start stroke');
    expect(loop.start).toHaveBeenCalledOnce();
    await ui.settings();
    await ui.click('Drawing sound');
    expect(ui.switch().checked).toBe(false);
    expect(sound.write).toHaveBeenLastCalledWith(
      '{"version":16,"soundEnabled":false,"strokeWidth":"medium","eraserWidth":"medium","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}'
    );
    expect(loop.dispose).toHaveBeenCalledOnce();
  });
  it('renders an audio failure then clears it after the next stroke recovers', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    sound.load.mockRejectedValueOnce(new Error('decode failed'));
    await mount();
    await ui.click('Start stroke');
    expect(ui.container.textContent).toContain('Drawing sound is unavailable');
    expect(ui.container.querySelector('[aria-live="polite"]').getAttribute('aria-live')).toBe(
      'polite'
    );
    await ui.click('Start stroke');
    await ui.click('Move stroke');
    expect(loop.start).toHaveBeenCalledOnce();
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.2);
    expect(ui.container.textContent).not.toContain('Drawing sound is unavailable');
  });
  it('waits for settings before the first usable frame and keeps choices made during a write', async () => {
    const read = pending();
    sound.scheme = 'dark';
    sound.read.mockReturnValueOnce(read.promise);
    await mount();
    expect(ui.container.textContent).toContain('Loading drawing settings');
    expect(ui.container.querySelector('[data-background="#1a1922"]')).not.toBeNull();
    expect(ui.container.querySelector('[data-status-bar]').dataset.statusBar).toBe('light-content');
    expect(ui.container.querySelector('button')).toBeNull();
    expect(sound.load).not.toHaveBeenCalled();
    await act(async () => read.resolve('{"version":1,"soundEnabled":false}'));
    await ui.settings();
    const write = pending();
    sound.write.mockReturnValueOnce(write.promise);
    await ui.click('Drawing sound');
    expect(ui.switch().disabled).toBe(false);
    await ui.click('Drawing sound');
    expect(ui.switch().checked).toBe(false);
    expect(sound.write).toHaveBeenCalledOnce();
    await act(async () => write.resolve());
    expect(sound.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sound.write.mock.calls[1][0]).soundEnabled).toBe(false);
    expect(ui.switch().disabled).toBe(false);
  });
  it('respects initial background state and releases on AppState backgrounding', async () => {
    sound.current = 'background';
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount();
    expect(sound.subscribe).toHaveBeenCalledWith('change', expect.any(Function));
    await ui.click('Start stroke');
    expect(sound.load).not.toHaveBeenCalled();
    await appState('active');
    await ui.click('Start stroke');
    await ui.click('Move stroke');
    await appState('background');
    expect(loop.dispose).toHaveBeenCalledOnce();
    await appState('active');
    await ui.click('Move stroke');
    expect(loop.start).toHaveBeenCalledOnce();
    ui.close();
    expect(sound.remove).toHaveBeenCalledTimes(sound.subscribe.mock.calls.length);
    expect(sound.listeners.size).toBe(0);
  });
  it('unsubscribes before releasing the player and stops disposed settings from writing', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount(Probe);
    await act(async () => latest.owner.audio.begin({ x: 0, y: 0 }, 1));
    expect(loop.start).toHaveBeenCalledOnce();
    const owner = latest.owner;
    ui.close();
    expect(sound.remove.mock.invocationCallOrder[0]).toBeLessThan(
      loop.dispose.mock.invocationCallOrder[0]
    );
    await owner.settings.setEnabled(false);
    owner.audio.begin({ x: 0, y: 0 }, 2);
    expect(sound.write).not.toHaveBeenCalled();
    expect(sound.load).toHaveBeenCalledOnce();
  });
  it('ignores a settings read that resolves after hook unmount', async () => {
    const read = pending();
    sound.read.mockReturnValueOnce(read.promise);
    await mount(Probe);
    const owner = latest.owner;
    ui.close();
    await act(async () => read.resolve('{"version":1,"soundEnabled":true}'));
    owner.audio.begin({ x: 0, y: 0 }, 1);
    expect(sound.load).not.toHaveBeenCalled();
    expect(sound.remove).toHaveBeenCalledOnce();
  });
});

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
