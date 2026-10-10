// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-drawing-screen-harness.mjs';

let screen;
let release;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.platform = 'ios';
  files.retainClosingModal = true;
  files.dismissModal = null;
  release = vi.fn();
  files.lock.mockReset().mockReturnValue(release);
  files.list.mockReset().mockReturnValue([]);
  files.pngRead.mockReset().mockResolvedValue(null);
  files.pngWrite.mockReset().mockResolvedValue(undefined);
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(() => {
  screen.close();
  files.platform = 'android';
  files.retainClosingModal = false;
  files.dismissModal = null;
  vi.clearAllMocks();
});

it('retains the menu input lease and disables every closing control until dismissal', async () => {
  await screen.click('Drawing tools. Marker selected.');
  expect(files.lock).toHaveBeenCalledOnce();
  await screen.click('Settings');
  expect(release).not.toHaveBeenCalled();
  expect(screen.button('Drawing sound')).toBeUndefined();
  const dialog = screen.dialog();
  const controls = [...dialog.querySelectorAll('button')];
  expect(controls.length).toBeGreaterThan(10);
  expect(controls.every((control) => control.disabled)).toBe(true);
  screen.button('Keep drawing').click();
  expect(release).not.toHaveBeenCalled();
  await act(async () => files.dismissModal());
  expect(release).toHaveBeenCalledOnce();
  expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(screen.button('Drawing sound')).toBeDefined();
  await screen.click('Close Settings');
  expect(screen.dialog()).not.toBeNull();
  expect(screen.button('Close Settings').disabled).toBe(true);
  expect(release).toHaveBeenCalledOnce();
  await act(async () => files.dismissModal());
  expect(screen.dialog()).toBeNull();
  expect(globalThis.document.activeElement).toBe(screen.button('Drawing tools. Marker selected.'));
  await screen.click('Draw fixture stroke');
  expect(JSON.parse(screen.paper()).strokes).toHaveLength(1);
});

it('releases the pending menu lease on unmount without running its successor', async () => {
  await screen.click('Drawing tools. Marker selected.');
  await screen.click('Pictures');
  expect(files.list).not.toHaveBeenCalled();
  screen.close();
  expect(release).toHaveBeenCalledOnce();
  expect(files.list).not.toHaveBeenCalled();
});

it('carries brush and width choices through menu dismissal into real history and Undo', async () => {
  await screen.click('Drawing tools. Marker selected.');
  await screen.click('Eraser');
  await screen.click('Eraser width: Thick');
  expect(JSON.parse(files.settingsWrite.mock.calls.at(-1)[0]).eraserWidth).toBe('thick');
  await screen.click('Keep drawing');
  expect(release).not.toHaveBeenCalled();
  await act(async () => files.dismissModal());
  expect(release).toHaveBeenCalledOnce();
  await screen.click('Draw fixture stroke');
  expect(JSON.parse(screen.paper()).strokes).toMatchObject([{ brush: 'eraser', width: 88 }]);
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toHaveLength(0);
});

it('retains the public PNG recovery owner and blocks retry behind Tools and color exploration', async () => {
  screen.close();
  files.pngRead.mockRejectedValue(new Error('recovery storage unavailable'));
  screen = createScreen();
  await act(async () => screen.mount());
  const retry = () => screen.button('Try PNG export again');
  await vi.waitFor(() => expect(retry()).toBeDefined());
  expect(screen.container.textContent).toContain(
    'Held PNGs could not be read. Existing recovery data has not been replaced.'
  );
  expect(retry().disabled).toBe(false);
  await screen.click('Drawing tools. Marker selected.');
  expect(retry().disabled).toBe(true);
  const reads = files.pngRead.mock.calls.length;
  retry().click();
  expect(files.pngRead).toHaveBeenCalledTimes(reads);
  await screen.click('Keep drawing');
  expect(retry().disabled).toBe(true);
  await act(async () => files.dismissModal());
  expect(retry().disabled).toBe(false);
  await screen.click('More colors');
  expect(retry().disabled).toBe(true);
  retry().click();
  expect(files.pngRead).toHaveBeenCalledTimes(reads);
  await screen.click('Keep drawing');
  expect(retry().disabled).toBe(false);
  await screen.click('Try PNG export again');
  expect(files.pngRead).toHaveBeenCalledTimes(reads + 1);
});
