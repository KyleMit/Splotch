// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';
const sound = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  load: vi.fn(),
  current: 'active',
  listener: null,
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
  listPictures: () => [],
  reopenPicture: vi.fn(),
  savePicture: vi.fn(),
  exportPng: vi.fn(),
}));
vi.mock('react-native', () => {
  const container = ({ children }) => createElement('div', null, children);
  return {
    AppState: {
      get currentState() {
        return sound.current;
      },
      addEventListener: (...args) => sound.subscribe(...args),
    },
    ActivityIndicator: () => null,
    Modal: ({ visible, children }) => visible && createElement('div', { role: 'dialog' }, children),
    Pressable: ({ children, onPress, disabled, accessibilityLabel }) =>
      createElement(
        'button',
        { onClick: onPress, disabled, 'aria-label': accessibilityLabel },
        children
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
    StyleSheet: { create: (styles) => styles },
  };
});
vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(({ onSoundStart, onSoundSample, onSoundEnd }, _ref) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        { onClick: () => onSoundStart({ x: 10, y: 20 }, 100) },
        'Start stroke'
      ),
      createElement(
        'button',
        { onClick: () => onSoundSample({ x: 60, y: 20 }, 200) },
        'Move stroke'
      ),
      createElement('button', { onClick: onSoundEnd }, 'End stroke')
    )
  ),
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
    close() {
      if (closed) return;
      closed = true;
      act(() => root.unmount());
      container.remove();
    },
    dialog: () => container.querySelector('[role="dialog"]'),
    switch: () => container.querySelector('[role="switch"]'),
  };
  await act(async () => root.render(createElement(component)));
}
async function appState(state) {
  await act(async () => sound.listener(state));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sound.current = 'active';
  sound.listener = null;
  sound.remove.mockReset();
  sound.subscribe.mockReset().mockImplementation((_name, listener) => {
    sound.listener = listener;
    return { remove: sound.remove };
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
    await ui.click('Settings');
    expect(ui.dialog()).not.toBeNull();
    expect(ui.switch().checked).toBe(false);
    sound.write.mockRejectedValueOnce(new Error('disk full'));
    await ui.click('Drawing sound');
    expect(ui.switch().checked).toBe(true);
    expect(ui.dialog().textContent).toContain('could not be saved');
    expect(sound.write).toHaveBeenLastCalledWith('{"version":1,"soundEnabled":true}');
    await ui.click('Retry saving');
    expect(sound.write).toHaveBeenCalledTimes(2);
    expect(ui.dialog().textContent).not.toContain('could not be saved');
    await ui.click('Close Settings');
    expect(ui.dialog()).toBeNull();
    await ui.click('Start stroke');
    expect(loop.start).toHaveBeenCalledOnce();
    await ui.click('Settings');
    await ui.click('Drawing sound');
    expect(ui.switch().checked).toBe(false);
    expect(sound.write).toHaveBeenLastCalledWith('{"version":1,"soundEnabled":false}');
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
  it('disables the sheet while hydration or a write is pending', async () => {
    const read = pending();
    sound.read.mockReturnValueOnce(read.promise);
    await mount();
    await ui.click('Start stroke');
    expect(sound.load).not.toHaveBeenCalled();
    await ui.click('Settings');
    expect(ui.switch().disabled).toBe(true);
    expect(ui.dialog().textContent).toContain('Loading sound settings');
    await act(async () => read.resolve('{"version":1,"soundEnabled":false}'));
    const write = pending();
    sound.write.mockReturnValueOnce(write.promise);
    await ui.click('Drawing sound');
    expect(ui.switch().disabled).toBe(true);
    expect(ui.dialog().textContent).toContain('Saving sound setting');
    await act(async () => write.resolve());
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
    expect(sound.remove).toHaveBeenCalledOnce();
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
