// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';

const sound = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  load: vi.fn(),
  clearLoad: vi.fn(),
  current: 'active',
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
vi.mock('../../experiments/native-architecture/src/platform/clearSound.ts', () => ({
  loadClearPageTurn: sound.clearLoad,
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return sound.current;
    },
    addEventListener: (...args) => sound.subscribe(...args),
  },
}));

function pending() {
  const { promise, resolve, reject } = Promise.withResolvers();
  return { promise, resolve, reject };
}
let ui, loop, turn, latest;
function Probe() {
  latest = useDrawingSound();
  return createElement('span', { 'aria-live': 'polite' }, latest.audioMessage);
}
async function mount(component = Probe) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let closed = false;
  ui = {
    container,
    close() {
      if (closed) return;
      closed = true;
      act(() => root.unmount());
      container.remove();
    },
  };
  await act(async () => root.render(createElement(component)));
}
async function appState(state) {
  await act(async () => sound.listeners.forEach((listener) => listener(state)));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sound.current = 'active';
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
  turn = { play: vi.fn(), dispose: vi.fn() };
  sound.clearLoad.mockReset().mockResolvedValue(turn);
  latest = null;
  ui = null;
});
afterEach(() => {
  ui?.close();
  vi.useRealTimers();
});

describe('live drawing sound hook ownership', () => {
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
  it('updates active sound through the live hook without replacing its audio owner', async () => {
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

  it('renders an audio failure then clears it after the next stroke recovers', async () => {
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    sound.load.mockRejectedValueOnce(new Error('decode failed'));
    await mount();
    await act(async () => latest.owner.audio.begin({ x: 10, y: 20 }, 100));
    expect(ui.container.textContent).toContain('Drawing sound is unavailable');
    expect(ui.container.querySelector('[aria-live="polite"]')).not.toBeNull();
    await act(async () => latest.owner.audio.begin({ x: 10, y: 20 }, 200));
    await act(async () => latest.owner.audio.sample({ x: 60, y: 20 }, 300));
    expect(loop.start).toHaveBeenCalledOnce();
    expect(loop.setVolume).toHaveBeenLastCalledWith(0.2);
    expect(ui.container.textContent).not.toContain('Drawing sound is unavailable');
  });
  it('respects initial background state and releases on AppState backgrounding', async () => {
    sound.current = 'background';
    sound.read.mockResolvedValueOnce('{"version":1,"soundEnabled":true}');
    await mount();
    expect(sound.subscribe).toHaveBeenCalledWith('change', expect.any(Function));
    await act(async () => latest.owner.audio.begin({ x: 10, y: 20 }, 100));
    expect(sound.load).not.toHaveBeenCalled();
    expect(sound.clearLoad).not.toHaveBeenCalled();
    await appState('active');
    expect(sound.clearLoad).toHaveBeenCalledOnce();
    await act(async () => latest.owner.audio.begin({ x: 10, y: 20 }, 200));
    await act(async () => latest.owner.audio.sample({ x: 60, y: 20 }, 300));
    await appState('background');
    expect(loop.dispose).toHaveBeenCalledOnce();
    expect(turn.dispose).toHaveBeenCalledOnce();
    await appState('active');
    expect(sound.clearLoad).toHaveBeenCalledTimes(2);
    await act(async () => latest.owner.audio.sample({ x: 80, y: 20 }, 400));
    expect(loop.start).toHaveBeenCalledOnce();
    ui.close();
    expect(sound.remove).toHaveBeenCalledTimes(sound.subscribe.mock.calls.length);
    expect(sound.listeners.size).toBe(0);
  });
});
