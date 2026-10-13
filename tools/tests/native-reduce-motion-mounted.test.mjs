// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreen, files, pictures } from './native-drawing-screen-harness.mjs';
let screen;
function pending() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function change(enabled) {
  await act(async () => {
    for (const listener of files.motionListeners) listener(enabled);
  });
}
async function open(kind) {
  if (kind === 'colors') await screen.click('More colors');
  else await screen.menuClick(kind === 'pages' ? 'Coloring pages' : 'Pictures');
}
function modal() {
  return screen.container.querySelector('[data-animation-type]');
}
async function escape() {
  await act(async () =>
    modal().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.motionRead.mockReset().mockResolvedValue(false);
  files.motionListeners.clear();
  files.motionRemoves.length = 0;
  files.motionListenError = null;
  files.save.mockReset().mockResolvedValue(undefined);
  files.list.mockReturnValue(pictures);
  files.lock.mockReset().mockReturnValue(() => {});
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen();
});
afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});
describe('mounted native drawing modal motion', () => {
  it.each(['colors', 'pages', 'pictures'])(
    'keeps %s reduced during initial loading then follows both device states without replacing the dialog',
    async (kind) => {
      const read = pending();
      files.motionRead.mockReturnValue(read.promise);
      await act(async () => screen.mount());
      await open(kind);
      const mounted = modal();
      expect(mounted.dataset.animationType).toBe('none');
      await act(async () => read.resolve(false));
      expect(modal()).toBe(mounted);
      expect(modal().dataset.animationType).toBe('fade');
      await change(true);
      expect(modal()).toBe(mounted);
      expect(modal().dataset.animationType).toBe('none');
      await change(false);
      expect(modal().dataset.animationType).toBe('fade');
      await escape();
      expect(modal()).toBeNull();
    }
  );
  it.each(['colors', 'pages', 'pictures'])(
    'honors an initially enabled preference for %s and preserves close behavior',
    async (kind) => {
      files.motionRead.mockResolvedValue(true);
      await act(async () => screen.mount());
      await open(kind);
      expect(modal().dataset.animationType).toBe('none');
      await screen.click(kind === 'pictures' ? 'Close' : 'Keep drawing');
      expect(modal()).toBeNull();
    }
  );
  it.each(['colors', 'pages', 'pictures'])(
    'contains read failure while %s closes and drawing remains usable',
    async (kind) => {
      files.motionRead.mockRejectedValue(new Error('unavailable'));
      await act(async () => screen.mount());
      await open(kind);
      expect(modal().dataset.animationType).toBe('none');
      await escape();
      await screen.click('Draw fixture stroke');
      expect(JSON.parse(screen.paper()).strokes).toHaveLength(1);
      const opener = [...screen.container.querySelectorAll('button')].find(
        (button) => button.getAttribute('aria-label') === 'Drawing tools'
      );
      await screen.click(opener.getAttribute('aria-label'));
      expect(screen.button('Save picture').disabled).toBe(false);
      await screen.click('Save picture');
      expect(files.save).toHaveBeenCalledOnce();
      expect(files.save.mock.calls[0][0].strokes).toHaveLength(1);
    }
  );
  it('ignores a delayed read after a live event through the actual adapter and restores color opener focus', async () => {
    const read = pending();
    files.motionRead.mockReturnValue(read.promise);
    await act(async () => screen.mount());
    const opener = screen.button('More colors');
    opener.focus();
    await open('colors');
    await change(true);
    await act(async () => read.resolve(false));
    expect(modal().dataset.animationType).toBe('none');
    await escape();
    expect(document.activeElement).toBe(opener);
  });
  it('keeps drawing and saving usable if native event subscription fails', async () => {
    files.motionListenError = new Error('native listener unavailable');
    await act(async () => screen.mount());
    await open('colors');
    expect(modal().dataset.animationType).toBe('none');
    await escape();
    await screen.click('Draw fixture stroke');
    const opener = [...screen.container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Drawing tools'
    );
    await screen.click(opener.getAttribute('aria-label'));
    await screen.click('Save picture');
    expect(files.save).toHaveBeenCalledOnce();
    expect(files.motionRead).not.toHaveBeenCalled();
    expect(files.motionListeners.size).toBe(0);
  });
  it('removes every native listener on unmount and ignores retained callbacks and delayed reads', async () => {
    const read = pending();
    files.motionRead.mockReturnValue(read.promise);
    await act(async () => screen.mount());
    await open('colors');
    const callbacks = [...files.motionListeners],
      removes = [...files.motionRemoves];
    screen.close();
    expect(files.motionListeners.size).toBe(0);
    expect(removes.every((remove) => remove.mock.calls.length === 1)).toBe(true);
    await act(async () => {
      for (const callback of callbacks) callback(false);
      read.resolve(false);
    });
    expect(screen.container.childElementCount).toBe(0);
    screen = createScreen();
  });
});
