import { caller, records, host, mount, openSettingsSection } from './rsd-native-selection-host.mjs';
import './rsd-native-settings-hub-mocks.mjs';
import { drawingScreen, rerender, storedSettings } from './rsd-native-settings-fixture.mjs';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { BASE_SCRATCH_GAIN } from '../../../experiments/native-architecture/src/audio/drawingAudio.ts';

// The Volume and Button Size sliders mounted through the real Settings caller and settings owner:
// a nudge made while the previous one is still writing, and the pencil heard while Volume moves.

function sliderProps(label) {
  const props = records.props.findLast(
    (entry) => entry.role === 'slider' && entry['aria-label'] === label
  );
  expect(props, label).toBeDefined();
  return props;
}

const adjust = (label, actionName) =>
  act(async () => sliderProps(label).onAccessibilityAction({ nativeEvent: { actionName } }));

const touch = (identifier, pageX) => ({
  nativeEvent: { identifier, pageX, touches: [{ identifier, pageX }], changedTouches: [] },
});

const SLIDER_WIDTH_PX = 400;

// The selection host refuses audio unless a case hands it a pencil loop to load.
afterEach(() => {
  caller.drawingLoop = undefined;
});

async function grab(label) {
  await act(async () =>
    sliderProps(label).onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: SLIDER_WIDTH_PX, height: 36 } },
    })
  );
  await act(async () => sliderProps(label).onResponderGrant(touch(1, 0)));
}

const drag = (label, to) => act(async () => sliderProps(label).onResponderMove(touch(1, to)));
const letGo = (label) => act(async () => sliderProps(label).onResponderRelease(touch(1, 0)));

function holdNextWrite(storage) {
  let finish;
  storage.write.mockImplementationOnce(
    (next) =>
      new Promise((resolve) => {
        finish = () => resolve(next);
      })
  );
  return () => act(async () => finish());
}

it.each([
  ['Volume', 'Sound', 'soundVolume', 50, { soundEnabled: true }],
  ['Button Size', 'Accessibility', 'buttonScale', 100, {}],
])(
  'keeps a %s nudge made while the previous one is still writing',
  async (label, section, key, start, overrides) => {
    const settings = storedSettings(overrides);
    const finish = holdNextWrite(settings.storage);
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    await openSettingsSection(section);
    await adjust(label, 'increment');
    expect(settings.storage.write).toHaveBeenCalledOnce();
    await adjust(label, 'increment');
    // The slider answers the second nudge rather than locking while the first one writes.
    expect(sliderProps(label)['aria-valuenow']).toBe(start + 2);
    expect(settings.storage.write).toHaveBeenCalledOnce();
    await finish();
    expect(settings.storage.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(settings.storage.write.mock.calls.at(-1)[0])[key]).toBe(start + 2);
    expect(caller.product.sound.settings).toMatchObject({ status: 'ready', [key]: start + 2 });
    expect(sliderProps(label)['aria-valuenow']).toBe(start + 2);
  }
);

it('keeps the last settled Volume when Settings closes before its write can start', async () => {
  const settings = storedSettings({ soundEnabled: true });
  const finish = holdNextWrite(settings.storage);
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Sound');
  await adjust('Volume', 'increment');
  await adjust('Volume', 'increment');
  await rerender({ settingsOpen: false });
  await finish();
  expect(JSON.parse(settings.storage.write.mock.calls.at(-1)[0]).soundVolume).toBe(52);
});

function pencilLoop() {
  const loop = { start: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  caller.drawingLoop = vi.fn(async () => loop);
  return loop;
}

const gainAt = (volume) => BASE_SCRATCH_GAIN * (volume / 50);

it('plays the pencil while Volume is dragged, at the gain of the value under the finger, and stops on release', async () => {
  const loop = pencilLoop();
  const settings = storedSettings({ soundEnabled: true, drawingSoundEnabled: false });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Sound');
  await grab('Volume');
  expect(caller.drawingLoop).toHaveBeenCalledOnce();
  // Shipping's preview answers to the Sound switch alone, so it plays with Drawing silenced.
  expect(loop.start).toHaveBeenCalledOnce();
  expect(loop.setVolume).toHaveBeenLastCalledWith(gainAt(50));
  await drag('Volume', SLIDER_WIDTH_PX / 4);
  expect(sliderProps('Volume')['aria-valuenow']).toBe(75);
  expect(loop.setVolume).toHaveBeenLastCalledWith(gainAt(75));
  expect(loop.stop).not.toHaveBeenCalled();
  await letGo('Volume');
  expect(loop.stop).toHaveBeenCalledOnce();
  expect(settings.stored().soundVolume).toBe(75);
  await grab('Volume');
  expect(caller.drawingLoop).toHaveBeenCalledOnce();
  expect(loop.start).toHaveBeenCalledTimes(2);
  expect(loop.setVolume).toHaveBeenLastCalledWith(gainAt(75));
  await letGo('Volume');
  expect(loop.stop).toHaveBeenCalledTimes(2);
});

it('stops the Volume preview when Settings closes or the app leaves mid-drag', async () => {
  const loop = pencilLoop();
  storedSettings({ soundEnabled: true });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Sound');
  await grab('Volume');
  expect(loop.start).toHaveBeenCalledOnce();
  await rerender({ settingsOpen: false });
  expect(host.querySelector('[role="slider"]')).toBeNull();
  expect(loop.stop).toHaveBeenCalledOnce();
  await rerender({ settingsOpen: true });
  await openSettingsSection('Sound');
  await grab('Volume');
  expect(loop.start).toHaveBeenCalledTimes(2);
  await act(async () => {
    for (const listener of [...records.appStateListeners]) listener('background');
  });
  expect(loop.dispose).toHaveBeenCalledOnce();
  await drag('Volume', SLIDER_WIDTH_PX / 4);
  expect(loop.setVolume).toHaveBeenCalledTimes(2);
});

it('plays nothing while Volume moves with Sound off', async () => {
  const loop = pencilLoop();
  storedSettings({ soundEnabled: true });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Sound');
  // Turning Sound off releases the loaded preview; the slider hides with it, so a held drag is
  // what remains to test.
  await grab('Volume');
  await act(async () => caller.product.sound.owner.settings.setEnabled(false));
  expect(loop.dispose).toHaveBeenCalledOnce();
  caller.drawingLoop.mockClear();
  await act(async () => caller.product.sound.owner.preview.begin(80));
  expect(caller.drawingLoop).not.toHaveBeenCalled();
  expect(loop.start).toHaveBeenCalledOnce();
});

it('clamps Button Size to the live panel ceiling without rewriting a larger saved choice', async () => {
  const settings = storedSettings({ buttonScale: 130 });
  records.dimensions = { width: 320, height: 440, scale: 3, fontScale: 1 };
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  const area = records.props.findLast((props) => props.testID === 'rsd-canvas-area');
  await act(async () =>
    area.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 365 } } })
  );
  await openSettingsSection('Accessibility');
  expect(sliderProps('Button Size')['aria-valuemax']).toBe(98);
  expect(sliderProps('Button Size')['aria-valuenow']).toBe(98);
  expect(caller.product.sound.settings.buttonScale).toBe(130);
  expect(settings.storage.write).not.toHaveBeenCalled();
  records.dimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
  await rerender({});
  const larger = records.props.findLast((props) => props.testID === 'rsd-canvas-area');
  await act(async () =>
    larger.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 769 } } })
  );
  expect(sliderProps('Button Size')['aria-valuemax']).toBe(130);
  expect(sliderProps('Button Size')['aria-valuenow']).toBe(130);
  expect(settings.storage.write).not.toHaveBeenCalled();
});
